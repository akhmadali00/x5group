import { db, limitedAll, type Sql } from './db';
import { can, isAdmin, TARGET_ROLES, type Me } from './perm';
import { REVERTABLE_SQL } from './services/history';

// Brauzer ilovasi (public/app/app.js) kutadigan "eski" jadval shakli.
// Hamma filtrlash SERVERDA: foydalanuvchi ruxsat etilmagan qatorni umuman olmaydi.

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TZ = 'Asia/Tashkent';

export function tashkentDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function archivedLabel(at: Date | string): string {
  const d = new Date(at);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const day = tashkentDate(d);
  if (day === tashkentDate()) return `Bugun, ${hm}`;
  const [y, m, dd] = day.split('-');
  return `${dd}.${m}.${y}, ${hm}`;
}

const addDaysIso = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const b01 = (v: unknown) => (v ? 1 : 0);
const list = (a: unknown) => (Array.isArray(a) ? a.join(', ') : '');
const orEmpty = (v: unknown) => (v === null || v === undefined ? '' : v);
const orUndef = (v: unknown) => (v === null || v === undefined ? undefined : v);

export type Datasets = {
  team: R[];
  profiles: R[];
  projects: R[];
  stages: R[];
  contents: R[];
  tasks: R[];
  shoots: R[];
  campaigns: R[];
  daily: R[];
  arch_contents: R[];
  efficiency: R[];
  audit: R[];
  backups: R[];
};

export type Loaded = { datasets: Datasets; archived: Record<string, string>; syncAt: string };

export async function loadDatasets(me: Me): Promise<Loaded> {
  return loadDatasetsOn(db(), me);
}

async function loadDatasetsOn(sql: Sql, me: Me): Promise<Loaded> {
  const admin = isAdmin(me);
  const since = addDaysIso(tashkentDate(), -29);

  const [members, projects, pms, mps, contents, tasks, shoots, campaigns, daily, archContents, auditRows, backupRows, effRows, syncRows] = await limitedAll([
    sql<R[]>`select * from members where active order by created_at, name`,
    sql<R[]>`select * from projects where archived_at is null order by created_at, name`,
    sql<R[]>`select project_id, member_id from project_pms`,
    sql<R[]>`select member_id, project_id from member_projects`,
    sql<R[]>`select * from contents where archived_at is null order by position, created_at`,
    sql<R[]>`select * from tasks ${admin ? sql`` : sql`where archived_at is null and assignee_id = ${me.id}`} order by created_at`,
    sql<R[]>`select * from shoots ${admin ? sql`` : sql`where archived_at is null`} order by shoot_date, shoot_time`,
    sql<R[]>`select * from campaigns order by started_on desc nulls last`,
    sql<R[]>`select * from daily_results order by day`,
    admin ? sql<R[]>`select * from contents where archived_at is not null order by archived_at desc` : Promise.resolve([] as R[]),
    admin ? sql<R[]>`select id, at, actor_name, action, entity, summary, reverted_at, (${sql.unsafe(REVERTABLE_SQL)}) as can_revert from audit_log order by id desc limit 300` : Promise.resolve([] as R[]),
    admin ? sql<R[]>`select id, created_at, kind, row_counts from backups order by id desc limit 60` : Promise.resolve([] as R[]),
    sql<R[]>`
    select m.name,
      (select count(*) from tasks t where t.assignee_id = m.id and t.archived_at is null and t.status in ('Tayyor','Tugatildi') and (t.done_at at time zone 'Asia/Tashkent')::date >= ${since})::int as done,
      (select count(*) from tasks t where t.assignee_id = m.id and t.archived_at is null and t.status in ('Tayyor','Tugatildi') and (t.done_at at time zone 'Asia/Tashkent')::date >= ${since} and (t.done_at at time zone 'Asia/Tashkent')::date <= t.due_on)::int as ontime,
      (select count(*) from tasks t where t.assignee_id = m.id and t.archived_at is null and t.status in ('Boshlanmagan','Jarayonda') and t.due_on < ${tashkentDate()})::int as overdue,
      (select coalesce(round(avg(((t.done_at at time zone 'Asia/Tashkent')::date - t.assigned_on))::numeric, 1), 0) from tasks t where t.assignee_id = m.id and t.archived_at is null and t.status in ('Tayyor','Tugatildi') and (t.done_at at time zone 'Asia/Tashkent')::date >= ${since}) as avg_days,
      (select count(*) from contents c where c.author_id = m.id and c.archived_at is null and (c.created_at at time zone 'Asia/Tashkent')::date >= ${since})::int as created,
      (select count(*) from contents c where c.author_id = m.id and c.archived_at is null and c.stage = 'Post Joylandi' and (c.updated_at at time zone 'Asia/Tashkent')::date >= ${since})::int as posted,
      (select count(*) from shoots s where (s.operator_id = m.id or s.brandface_id = m.id) and s.archived_at is null and s.status = 'Tugatildi' and s.shoot_date >= ${since})::int as shoots
    from members m where m.active ${admin ? sql`` : sql`and m.id = ${me.id}`} order by m.name`,
    sql<{ value: { at?: string } }[]>`select value from settings where key = 'sync.last'`
  ] as const);
  const syncRow = syncRows[0];

  const mName = new Map<string, string>(members.map((m) => [m.id, m.name]));
  const visibleProjects = admin ? projects : projects.filter((p) => me.projectIds.has(p.id));
  const pName = new Map<string, string>(projects.map((p) => [p.id, p.name]));
  const visibleIds = new Set(visibleProjects.map((p) => p.id));

  // ---- team ----
  const pmsByProject = new Map<string, string[]>();
  for (const x of pms) pmsByProject.set(x.project_id, [...(pmsByProject.get(x.project_id) || []), mName.get(x.member_id) || '']);
  const projByMember = new Map<string, Set<string>>();
  for (const x of mps) (projByMember.get(x.member_id) || projByMember.set(x.member_id, new Set()).get(x.member_id)!).add(x.project_id);
  for (const x of pms) (projByMember.get(x.member_id) || projByMember.set(x.member_id, new Set()).get(x.member_id)!).add(x.project_id);

  const team = members.map((m) => {
    const self = m.id === me.id;
    const isFr = m.kind === 'freelance';
    const contactOk = admin || self || can(me, isFr ? 'jamoa.frilans' : 'jamoa.azolar');
    const projOk = admin || self || can(me, 'jamoa.azolar');
    const row: R = {
      ism: m.name,
      rol: m.role === 'admin' ? 'Admin' : "A'zo",
      lavozim: orEmpty(m.position),
      rang: orEmpty(m.color)
    };
    if (isFr) row.tur = 'frilans';
    if (contactOk) {
      row.telefon = orEmpty(m.phone);
      row.telegram = orEmpty(m.telegram_username);
    }
    if (admin || self) {
      row.id = m.id;
      row.tg_holat = m.telegram_status;
      if (self) row.totp = m.totp_enabled ? 1 : 0;
      row.email = orEmpty(m.email);
      row.ruxsat = (m.permissions || []).join(', ');
    }
    if (projOk && !isFr) {
      row.loyihalar = [...(projByMember.get(m.id) || [])]
        .filter((id) => admin || visibleIds.has(id))
        .map((id) => pName.get(id) || '')
        .filter(Boolean)
        .join(', ');
    }
    return row;
  });

  // ---- loyihalar ----
  const profiles = visibleProjects.map((p) => {
    const r: R = {
      loyiha: p.name,
      pm: (pmsByProject.get(p.id) || []).join(', '),
      boshlangan: orEmpty(p.contract_start),
      muddat: orUndef(p.contract_months),
      kontentlar: orUndef(p.plan_total),
      targetga: orUndef(p.target_plan),
      ega: orEmpty(p.owner_name),
      ega_telefon: orEmpty(p.owner_phone),
      ega_telegram: orEmpty(p.owner_telegram),
      ega_instagram: orEmpty(p.owner_instagram),
      holat: p.status,
      ig_havola: orEmpty(p.ig_link),
      tg_havola: orEmpty(p.tg_link),
      yt_havola: orEmpty(p.yt_link),
      ig_boshlang: orUndef(p.ig_start),
      ig_hozir: orUndef(p.ig_now),
      tg_boshlang: orUndef(p.tg_start),
      tg_hozir: orUndef(p.tg_now),
      yt_boshlang: orUndef(p.yt_start),
      yt_hozir: orUndef(p.yt_now),
      oxvat_boshlang: orUndef(p.reach_start),
      oxvat_hozir: orUndef(p.reach_now)
    };
    if (admin) {
      r.manba = orEmpty(p.ads_source);
      r.akkaunt = orEmpty(p.ad_account);
      r.portfolio = orEmpty(p.portfolio);
      r.id = p.id;
    }
    return r;
  });
  const projectsDs = visibleProjects.map((p) => ({ loyiha: p.name }));

  // Bosqich sonlari kontentlardan avtomatik hisoblanadi (qo'lda kiritilmaydi)
  const BUCKET: Record<string, 'goyalar' | 'skript' | 'montaj' | 'joylangan'> = {
    "G'oya": 'goyalar', Ijobiy: 'goyalar',
    'Skript Tayyor': 'skript', 'Syomka Qilindi': 'skript', 'TZ Berildi': 'skript',
    'Montaj Tayyor': 'montaj', Tasdiqlandi: 'montaj',
    'Post Joylandi': 'joylangan'
  };
  const counts = new Map<string, Record<string, number>>();
  for (const c of contents) {
    const o = counts.get(c.project_id) || counts.set(c.project_id, { goyalar: 0, skript: 0, montaj: 0, joylangan: 0, rekda: 0 }).get(c.project_id)!;
    const k = BUCKET[c.stage];
    if (k) o[k]++;
    if (c.rekda) o.rekda++;
  }
  const stagesDs = visibleProjects.map((p) => ({ loyiha: p.name, goyalar: 0, skript: 0, montaj: 0, joylangan: 0, rekda: 0, ...(counts.get(p.id) || {}) }));

  // ---- kontentlar ----
  const contentRow = (c: R) => ({
      id: c.id,
      loyiha: pName.get(c.project_id) || '',
      tartib: c.position,
      nomi: c.title,
      tayyorladi: mName.get(c.author_id) || '',
      montajor: mName.get(c.editor_id) || '',
      bosqich: c.stage,
      rekda: b01(c.rekda),
      target: b01(c.target),
      syomka: orEmpty(c.shoot_date),
      joylash: orEmpty(c.post_date),
      vaqt: orEmpty(c.post_time),
      platformalar: list(c.platforms),
      avto: b01(c.auto_post),
      rubrika: orEmpty(c.category),
      hook: orEmpty(c.hook),
      mainbody: orEmpty(c.main_body),
      cta: orEmpty(c.cta),
      reference: orEmpty(c.reference_url),
      caption: orEmpty(c.caption),
      material: orEmpty(c.material_url),
      joylandi: list(c.posted_on),
      havola_instagram: orEmpty(c.link_instagram),
      havola_telegram: orEmpty(c.link_telegram),
      havola_youtube: orEmpty(c.link_youtube),
      izoh_instagram: orEmpty(c.note_instagram),
      izoh_telegram: orEmpty(c.note_telegram),
      izoh_youtube: orEmpty(c.note_youtube)
    });
  const contentsDs = contents.filter((c) => visibleIds.has(c.project_id)).map(contentRow);

  // ---- vazifalar ----
  const archived: Record<string, string> = {};
  const archContentsDs = archContents.map((c) => {
    archived['content:' + c.id] = archivedLabel(c.archived_at);
    return contentRow(c);
  });
  const tasksDs = tasks.map((t) => {
    if (t.archived_at) archived['task:' + t.id] = archivedLabel(t.archived_at);
    return {
      id: t.id,
      kimga: mName.get(t.assignee_id) || '',
      vazifa: t.title,
      izoh: orEmpty(t.note),
      muddat: t.duration_days,
      sana: t.due_on,
      holat: t.status
    };
  });

  // ---- syomkalar ----
  const shootsDs = shoots
    .filter((s) => admin || visibleIds.has(s.project_id) || s.operator_id === me.id || s.brandface_id === me.id)
    .map((s) => {
      if (s.archived_at) archived['shoot:' + s.id] = archivedLabel(s.archived_at);
      return {
        id: s.id,
        mijoz: pName.get(s.project_id) || '',
        qayerda: s.place,
        sana: s.shoot_date,
        soat: s.shoot_time,
        operator: mName.get(s.operator_id) || '',
        brandface: mName.get(s.brandface_id) || '',
        holat: s.status,
        qoshimcha: orEmpty(s.note)
      };
    });

  // ---- target (faqat ruxsati bor PM / Targetolog / Admin) ----
  const targetOk = admin || (can(me, 'target') && !!me.position && TARGET_ROLES.includes(me.position));
  const campaignsDs = targetOk
    ? campaigns
        .filter((k) => visibleIds.has(k.project_id))
        .map((k) => ({
          kampaniya: k.name,
          sana: orEmpty(k.started_on),
          holati: orEmpty(k.status),
          mijoz: pName.get(k.project_id) || '',
          maqsad: orEmpty(k.goal),
          kunlik: orUndef(k.daily_budget),
          sarflandi: k.spent,
          natija: k.result,
          natijaTuri: orEmpty(k.result_type),
          lid: k.leads,
          korish: k.views,
          qamrov: k.reach,
          video3s: k.video_3s,
          thruplay: k.thruplay,
          obunachi: k.followers,
          manba: orEmpty(k.source),
          havola: orEmpty(k.link),
          havola_suite: orEmpty(k.link_suite)
        }))
    : [];
  const dailyDs = targetOk
    ? daily
        .filter((d) => visibleIds.has(d.project_id))
        .map((d) => ({ id: `${d.project_id}-${d.day}`, mijoz: pName.get(d.project_id) || '', sana: d.day, lid: d.leads, sarf: d.spend, toliq: b01(d.complete) }))
    : [];

  // ---- samaradorlik (oxirgi 30 kun): Admin hammani, boshqalar faqat o'zini ko'radi ----
  const efficiencyDs = effRows.map((r) => ({ ism: r.name, bajarildi: r.done, vaqtida: r.ontime, kechikkan: r.overdue, ortacha: Number(r.avg_days), kontent: r.created, joylangan: r.posted, syomka: r.shoots }));

  return {
    datasets: {
      team,
      profiles,
      projects: projectsDs,
      stages: stagesDs,
      contents: contentsDs,
      tasks: tasksDs,
      shoots: shootsDs,
      campaigns: campaignsDs,
      daily: dailyDs,
      arch_contents: archContentsDs,
      efficiency: efficiencyDs,
      backups: backupRows.map((b) => ({ id: String(b.id), vaqt: archivedLabel(b.created_at), tur: b.kind, hajm: Object.values(b.row_counts as Record<string, number>).reduce((a, x) => a + x, 0) })),
      audit: auditRows.map((a) => ({ id: String(a.id), kim: a.actor_name || 'Tizim', amal: a.action, tur: a.entity, mazmun: a.summary, vaqt: archivedLabel(a.at), qaytarilgan: b01(a.reverted_at), qaytarsa: b01(a.can_revert) }))
    },
    archived: admin ? archived : {},
    syncAt: syncRow?.value?.at ? archivedLabel(syncRow.value.at) : ''
  };
}
