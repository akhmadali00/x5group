// Oylik hisobot (PDF): umumiy ko'rsatkichlar, jamoa samaradorligi, loyihalar kesimi.
import type { Sql } from './db';
import { toPdfReport } from './files';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const money = (n: unknown) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + '%' : '—');

/** month: 'YYYY-MM' */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to, label: `${MONTHS[m - 1]} ${y}` };
}

export async function monthlyReportPdf(sql: Sql, month: string): Promise<{ buf: Buffer; name: string; summary: string }> {
  const { from, to, label } = monthRange(month);
  const D = (col: string) => sql.unsafe(`(${col} at time zone 'Asia/Tashkent')::date`);
  const [tk] = await sql<R[]>`
    select count(*) filter (where status in ('Tayyor','Tugatildi') and ${D('done_at')} between ${from} and ${to}) as done,
           count(*) filter (where status in ('Tayyor','Tugatildi') and ${D('done_at')} between ${from} and ${to} and ${D('done_at')} <= due_on) as ontime,
           count(*) filter (where status in ('Boshlanmagan','Jarayonda') and due_on <= ${to}) as overdue
    from tasks where archived_at is null`;
  const [sh] = await sql<R[]>`select count(*) filter (where status = 'Tugatildi') as done, count(*) filter (where status like 'Bekor%') as cancelled
    from shoots where archived_at is null and shoot_date between ${from} and ${to}`;
  const [ct] = await sql<R[]>`select count(*) filter (where ${D('created_at')} between ${from} and ${to}) as created,
    count(*) filter (where stage = 'Post Joylandi' and ${D('updated_at')} between ${from} and ${to}) as posted
    from contents where archived_at is null`;
  const people = await sql<R[]>`
    select m.name, coalesce(m.position, case when m.kind = 'freelance' then 'Frilanser' else '' end) as position,
      (select count(*) from tasks t where t.assignee_id = m.id and t.archived_at is null and t.status in ('Tayyor','Tugatildi') and ${D('t.done_at')} between ${from} and ${to})::int as done,
      (select count(*) from tasks t where t.assignee_id = m.id and t.archived_at is null and t.status in ('Tayyor','Tugatildi') and ${D('t.done_at')} between ${from} and ${to} and ${D('t.done_at')} <= t.due_on)::int as ontime,
      (select count(*) from tasks t where t.assignee_id = m.id and t.archived_at is null and t.status in ('Boshlanmagan','Jarayonda') and t.due_on <= ${to})::int as overdue,
      (select count(*) from contents c where c.author_id = m.id and c.archived_at is null and ${D('c.created_at')} between ${from} and ${to})::int as created,
      (select count(*) from contents c where c.author_id = m.id and c.archived_at is null and c.stage = 'Post Joylandi' and ${D('c.updated_at')} between ${from} and ${to})::int as posted
    from members m where m.active order by m.name`;
  const projects = await sql<R[]>`
    select p.name,
      (select count(*) from contents c where c.project_id = p.id and c.archived_at is null and ${D('c.created_at')} between ${from} and ${to})::int as created,
      (select count(*) from contents c where c.project_id = p.id and c.archived_at is null and c.stage = 'Post Joylandi' and ${D('c.updated_at')} between ${from} and ${to})::int as posted,
      (select count(*) from shoots s where s.project_id = p.id and s.archived_at is null and s.status = 'Tugatildi' and s.shoot_date between ${from} and ${to})::int as shoots,
      (select coalesce(sum(spend), 0) from daily_results d where d.project_id = p.id and d.day between ${from} and ${to}) as spend,
      (select coalesce(sum(leads), 0) from daily_results d where d.project_id = p.id and d.day between ${from} and ${to})::int as leads
    from projects p where p.archived_at is null order by p.name`;

  const spend = projects.reduce((a, x) => a + Number(x.spend), 0);
  const leads = projects.reduce((a, x) => a + Number(x.leads), 0);
  const sections = [
    {
      heading: 'Umumiy ko\'rsatkichlar',
      lines: [
        `Vazifalar: ${tk.done} ta bajarildi, o'z vaqtida: ${pct(Number(tk.ontime), Number(tk.done))}; hozir kechikkan: ${tk.overdue}`,
        `Syomkalar: ${sh.done} ta o'tdi, ${sh.cancelled} ta bekor qilindi`,
        `Kontent: ${ct.created} ta yangi, ${ct.posted} ta joylandi`,
        ...(spend > 0 || leads > 0 ? [`Reklama: ${money(spend)} sarf, ${leads} ta lid` + (leads > 0 ? `, o'rtacha narx ${money(spend / leads)}` : '')] : [])
      ]
    },
    {
      heading: 'Jamoa samaradorligi',
      table: {
        columns: ['Ism', 'Lavozim', 'Bajarilgan vazifa', "O'z vaqtida", 'Kechikkan', 'Yangi kontent', 'Joylangan'],
        rows: people.map((x) => [x.name, x.position || '', String(x.done), pct(x.ontime, x.done), String(x.overdue), String(x.created), String(x.posted)])
      }
    },
    {
      heading: 'Loyihalar',
      table: {
        columns: ['Loyiha', 'Yangi kontent', 'Joylangan', 'Syomka', 'Reklama sarfi', 'Lid'],
        rows: projects.map((x) => [x.name, String(x.created), String(x.posted), String(x.shoots), money(x.spend), String(x.leads)])
      }
    }
  ];
  const buf = await toPdfReport(`Oylik hisobot — ${label}`, `${from} – ${to}`, sections);
  const summary = `📊 <b>Oylik hisobot — ${label}</b>\nVazifa: ${tk.done} ta (o'z vaqtida ${pct(Number(tk.ontime), Number(tk.done))}) · Syomka: ${sh.done} ta · Joylangan: ${ct.posted} ta`;
  return { buf, name: `x5group-hisobot-${month}.pdf`, summary };
}
