// Vaqtli eslatmalar va hisobotlar. /api/cron/tick har daqiqada chaqiradi; har eslatma reminder_log orqali faqat bir marta yuboriladi.
import { db, type Sql } from './db';
import { enqueue, enqueueToAdmins, flushOutbox } from './outbox';
import { botEnabled, esc, sendDocument, type Keyboard } from './telegram';
import { monthlyReportPdf } from './monthlyReport';
import { addDays } from './services/common';
import { dailyBackup } from './backup';

export const TZ = 'Asia/Tashkent';
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function localParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 } as Record<string, number>)[p.weekday] ?? 0;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), dow, day: Number(p.day), hm: `${p.hour}:${p.minute}` };
}
export type Local = ReturnType<typeof localParts>;

const dm = (iso: string) => { const [, m, d] = String(iso).split('-'); return `${d}.${m}`; };
const OPEN = ['Boshlanmagan', 'Jarayonda'];
const PLAT_NAME: Record<string, string> = { instagram: 'Instagram', telegram: 'Telegram', youtube: 'YouTube' };

type Person = { id: string; name: string; role: string; position: string | null; chat: string };

async function people(sql: Sql): Promise<Person[]> {
  const rows = await sql<R[]>`select id, name, role, position, telegram_chat_id from members where active and telegram_status = 'approved' and telegram_chat_id is not null`;
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, position: r.position, chat: String(r.telegram_chat_id) }));
}

/** Bir martalik yuborish: (kind, ref, chat) bo'yicha takrorlanmaydi. */
async function sendOnce(sql: Sql, kind: string, ref: string, chat: string, text: string, kb?: Keyboard | null) {
  const r = await sql`insert into reminder_log (kind, ref, chat_id) values (${kind}, ${ref}, ${chat}) on conflict do nothing returning kind`;
  if (r.length) await enqueue(sql, chat, text, kb);
}

async function pmMap(sql: Sql): Promise<Map<string, string[]>> {
  const rows = await sql<{ project_id: string; member_id: string }[]>`select project_id, member_id from project_pms`;
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.project_id, [...(m.get(r.project_id) || []), r.member_id]);
  return m;
}

/** Kunlik qisqacha: shu a'zoning vazifalari, syomkalari va bugungi joylashlari. null = hech narsa yo'q. */
export async function dayDigest(sql: Sql, who: Person, date: string, title = '☀️ <b>Xayrli tong</b>'): Promise<string | null> {
  const admin = who.role === 'admin';
  const pms = await pmMap(sql);
  const parts: string[] = [];

  const tasks = await sql<R[]>`
    select t.title, t.due_on, t.status, m.name as who from tasks t join members m on m.id = t.assignee_id
    where t.archived_at is null and t.status in ('Boshlanmagan','Jarayonda') and t.due_on <= ${date} ${admin ? sql`` : sql`and t.assignee_id = ${who.id}`}
    order by t.due_on, t.created_at limit 20`;
  if (tasks.length) {
    parts.push('📝 <b>Vazifalar</b>\n' + tasks.map((t) => `${t.due_on < date ? '⚠️ kechikkan' : '• bugun'}: ${esc(t.title)}${admin ? ` — ${esc(t.who)}` : ''} (${dm(t.due_on)})`).join('\n'));
  }

  const shoots = await sql<R[]>`
    select s.*, p.name as project from shoots s join projects p on p.id = s.project_id
    where s.archived_at is null and s.status = 'Rejada' and s.shoot_date = ${date} order by s.shoot_time`;
  const mine = shoots.filter((s) => admin || s.operator_id === who.id || s.brandface_id === who.id || (pms.get(s.project_id) || []).includes(who.id));
  if (mine.length) parts.push('🎬 <b>Bugungi syomka</b>\n' + mine.map((s) => `• ${esc(s.shoot_time)} — ${esc(s.project)}, ${esc(s.place)}`).join('\n'));

  const posts = await sql<R[]>`
    select c.*, p.name as project from contents c join projects p on p.id = c.project_id
    where c.archived_at is null and c.stage = 'Tasdiqlandi' and c.post_date = ${date} order by c.post_time nulls last`;
  const myPosts = posts.filter((c) => admin || c.author_id === who.id || (pms.get(c.project_id) || []).includes(who.id));
  if (myPosts.length) parts.push('📣 <b>Bugun joylanadi</b>\n' + myPosts.map((c) => `• ${esc(c.post_time || '—')} — ${esc(c.project)}: ${esc(c.title)} (${(c.platforms as string[]).map((x) => PLAT_NAME[x] || x).join(', ') || '—'})`).join('\n'));

  return parts.length ? `${title}\n\n${parts.join('\n\n')}` : null;
}

async function eveningShoots(sql: Sql, t: Local) {
  if (t.minutes < 20 * 60 || t.minutes >= 23 * 60) return;
  const tomorrow = addDays(t.date, 1);
  const shoots = await sql<R[]>`
    select s.*, p.name as project from shoots s join projects p on p.id = s.project_id
    where s.archived_at is null and s.status = 'Rejada' and s.shoot_date = ${tomorrow} order by s.shoot_time`;
  if (!shoots.length) return;
  const pms = await pmMap(sql);
  const ppl = await people(sql);
  for (const p of ppl) {
    const mine = shoots.filter((s) => p.role === 'admin' || s.operator_id === p.id || s.brandface_id === p.id || (pms.get(s.project_id) || []).includes(p.id));
    if (!mine.length) continue;
    const text = `🌙 <b>Ertaga syomka bor</b>\n` + mine.map((s) => `• ${esc(s.shoot_time)} — ${esc(s.project)}\n  📍 ${esc(s.place)}${s.note ? `\n  📝 ${esc(s.note)}` : ''}`).join('\n');
    await sendOnce(sql, 'shoot-eve', tomorrow, p.chat, text);
  }
}

async function morning(sql: Sql, t: Local) {
  if (t.minutes < 8 * 60 || t.minutes >= 12 * 60) return;
  for (const p of await people(sql)) {
    const txt = await dayDigest(sql, p, t.date);
    if (txt) await sendOnce(sql, 'morning', t.date, p.chat, txt);
  }
}

async function postReminders(sql: Sql, t: Local) {
  const posts = await sql<R[]>`
    select c.*, p.name as project from contents c join projects p on p.id = c.project_id
    where c.archived_at is null and c.stage = 'Tasdiqlandi' and c.post_date = ${t.date} and c.post_time is not null`;
  if (!posts.length) return;
  const pms = await pmMap(sql);
  const ppl = new Map((await people(sql)).map((p) => [p.id, p]));
  for (const c of posts) {
    const [hh, mm] = String(c.post_time).split(':').map(Number);
    const diff = hh * 60 + mm - t.minutes;
    const kind = diff > 60 && diff <= 120 ? 'post2h' : diff > 0 && diff <= 60 ? 'post1h' : null;
    if (!kind) continue;
    const manual = (c.platforms as string[]).filter((x) => !(x === 'telegram' && c.auto_post) && !(c.posted_on as string[]).includes(x));
    if (!manual.length) continue;
    const notes = manual.map((x) => ({ x, n: c[`note_${x}`] as string | null })).filter((y) => y.n);
    const text =
      `⏰ <b>Post ${kind === 'post2h' ? '2 soatdan' : '1 soatdan'} keyin</b>\n${esc(c.project)} — «${esc(c.title)}»\n🕒 ${esc(c.post_time)}\nPlatforma: ${manual.map((x) => PLAT_NAME[x] || x).join(', ')}` +
      (c.material_url ? `\n🎞 ${esc(c.material_url)}` : "\n⚠️ Material kiritilmagan") +
      notes.map((y) => `\n\n📝 <b>${PLAT_NAME[y.x]} izohi:</b>\n${esc(String(y.n).slice(0, 500))}`).join('');
    const kb: Keyboard = manual.map((x) => [{ text: `✅ ${PLAT_NAME[x] || x} — joylandi`, data: `p:${c.id}:${x}` }]);
    if (c.material_url && /^https?:\/\//i.test(c.material_url)) kb.push([{ text: '🎞 Materialni ochish', url: c.material_url }]);
    const to = [...new Set([c.author_id, ...(pms.get(c.project_id) || [])].filter(Boolean))] as string[];
    for (const id of to) {
      const p = ppl.get(id);
      if (p) await sendOnce(sql, kind, `${c.id}:${t.date}`, p.chat, text, kb);
    }
  }
}

async function periodReport(sql: Sql, from: string, to: string, label: string): Promise<string> {
  // from..to (ikkalasi ham kiritiladi), Toshkent sanalari
  const [tk] = await sql<R[]>`
    select count(*) filter (where status in ('Tayyor','Tugatildi') and (done_at at time zone 'Asia/Tashkent')::date between ${from} and ${to}) as done,
           count(*) filter (where status in ('Tayyor','Tugatildi') and (done_at at time zone 'Asia/Tashkent')::date between ${from} and ${to} and (done_at at time zone 'Asia/Tashkent')::date <= due_on) as ontime,
           count(*) filter (where status in ('Boshlanmagan','Jarayonda') and due_on < ${to}) as overdue
    from tasks where archived_at is null`;
  const [sh] = await sql<R[]>`select count(*) filter (where status = 'Tugatildi') as done, count(*) filter (where status like 'Bekor%') as cancelled from shoots where archived_at is null and shoot_date between ${from} and ${to}`;
  const posted = await sql<R[]>`select p.name, count(*)::int as n from contents c join projects p on p.id = c.project_id where c.archived_at is null and c.stage = 'Post Joylandi' and (c.updated_at at time zone 'Asia/Tashkent')::date between ${from} and ${to} group by p.name order by n desc`;
  const per = await sql<R[]>`
    select m.name, count(*)::int as done, count(*) filter (where (t.done_at at time zone 'Asia/Tashkent')::date <= t.due_on)::int as ontime
    from tasks t join members m on m.id = t.assignee_id
    where t.archived_at is null and t.status in ('Tayyor','Tugatildi') and (t.done_at at time zone 'Asia/Tashkent')::date between ${from} and ${to} group by m.name order by done desc`;
  const lines = [`📊 <b>${label}</b> (${dm(from)} – ${dm(to)})`];
  lines.push(`\n📝 Vazifa: ${tk.done} ta bajarildi (${tk.ontime} tasi o'z vaqtida), kechikkan: ${tk.overdue}`);
  lines.push(`🎬 Syomka: ${sh.done} ta o'tdi, ${sh.cancelled} ta bekor`);
  lines.push(`📣 Joylangan kontent: ${posted.reduce((a, x) => a + x.n, 0)} ta` + (posted.length ? '\n' + posted.map((x) => `  • ${esc(x.name)}: ${x.n}`).join('\n') : ''));
  if (per.length) lines.push('\n👥 <b>Jamoa</b>\n' + per.map((x) => `• ${esc(x.name)}: ${x.done} ta (${x.ontime} tasi o'z vaqtida)`).join('\n'));
  return lines.join('\n');
}

async function reports(sql: Sql, t: Local) {
  if (t.minutes < 9 * 60 || t.minutes >= 12 * 60) return;
  const admins = (await people(sql)).filter((p) => p.role === 'admin');
  if (!admins.length) return;
  if (t.dow === 1) {
    const text = await periodReport(sql, addDays(t.date, -7), addDays(t.date, -1), 'Haftalik hisobot');
    for (const a of admins) await sendOnce(sql, 'weekly', t.date, a.chat, text);
  }
  if (t.day === 1) {
    const [y, m] = t.date.split('-').map(Number);
    const prevStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const prevEnd = addDays(t.date, -1);
    const text = await periodReport(sql, prevStart, prevEnd, 'Oylik hisobot');
    for (const a of admins) await sendOnce(sql, 'monthly', t.date.slice(0, 7), a.chat, text);
    // PDF hisobot: o'tgan oy uchun, har Admin'ga bir marta (yuborilmasa keyingi daqiqada qayta uriniladi)
    const month = prevStart.slice(0, 7);
    let pdf: Awaited<ReturnType<typeof monthlyReportPdf>> | null = null;
    for (const a of admins) {
      const ins = await sql`insert into reminder_log (kind, ref, chat_id) values ('monthly-pdf', ${month}, ${a.chat}) on conflict do nothing returning kind`;
      if (!ins.length) continue;
      try {
        pdf = pdf || (await monthlyReportPdf(sql, month));
        await sendDocument(a.chat, pdf.name, new Uint8Array(pdf.buf), pdf.summary.replace(/<[^>]+>/g, ''));
      } catch (e) {
        await sql`delete from reminder_log where kind = 'monthly-pdf' and ref = ${month} and chat_id = ${a.chat}`;
        throw e;
      }
    }
  }
}

export async function runTick(now = new Date()) {
  if (!botEnabled()) return { sent: 0, skipped: 'bot sozlanmagan' };
  const sql = db();
  const t = localParts(now);
  const errors: string[] = [];
  for (const [name, fn] of [
    ['evening', () => eveningShoots(sql, t)],
    ['morning', () => morning(sql, t)],
    ['posts', () => postReminders(sql, t)],
    ['reports', () => reports(sql, t)],
    ['backup', () => dailyBackup(sql, t)]
  ] as [string, () => Promise<void>][]) {
    try { await fn(); } catch (e) { errors.push(`${name}: ${(e as Error).message}`); console.error('[x5] tick', name, e); }
  }
  await sql`delete from reminder_log where sent_at < now() - interval '40 days'`;
  await sql`delete from link_codes where expires_at < now()`;
  const sent = await flushOutbox(200);
  return { sent, errors };
}

export { enqueueToAdmins };
