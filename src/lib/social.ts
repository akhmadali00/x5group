// Obunachilar sonini avtomatik yangilash (Telegram, YouTube, Instagram) va reklama signallari.
import type { Sql } from './db';
import { tg, botEnabled, esc } from './telegram';
import { enqueue, adminChats } from './outbox';
import { syncMeta, metaEnabled, type SyncResult } from './meta';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const handleOf = (link: string | null | undefined, hosts: RegExp): string | null => {
  const s = String(link || '').trim();
  if (!s) return null;
  if (/^@?[\w.]+$/.test(s)) return s.replace(/^@/, '');
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!hosts.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean);
    return seg[0] ? seg[0].replace(/^@/, '') : null;
  } catch { return null; }
};

async function telegramCount(link: string | null): Promise<number | null> {
  const h = handleOf(link, /(^|\.)t\.me$|(^|\.)telegram\.me$/);
  if (!h || !botEnabled() || /^(joinchat|\+)/.test(h)) return null;
  const n = await tg<number>('getChatMemberCount', { chat_id: '@' + h });
  return typeof n === 'number' ? n : null;
}

async function youtubeCount(link: string | null): Promise<number | null> {
  const key = process.env.YOUTUBE_API_KEY;
  const s = String(link || '').trim();
  if (!key || !s) return null;
  let q: Record<string, string> | null = null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0]?.startsWith('@')) q = { forHandle: seg[0] };
    else if (seg[0] === 'channel' && seg[1]) q = { id: seg[1] };
    else if (seg[0] === 'user' && seg[1]) q = { forUsername: seg[1] };
  } catch { /* noto'g'ri havola */ }
  if (!q) return null;
  const url = new URL(`${process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com'}/youtube/v3/channels`);
  url.searchParams.set('part', 'statistics');
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000) });
  const j = (await res.json().catch(() => null)) as R | null;
  if (!res.ok || !j) throw new Error(j?.error?.message || `YouTube xatosi (${res.status})`);
  const st = j.items?.[0]?.statistics;
  if (!st || st.hiddenSubscriberCount) return null;
  const n = Number(st.subscriberCount);
  return Number.isFinite(n) ? n : null;
}

/** Instagram: o'zimizning Business akkauntimiz orqali ochiq akkaunt obunachilari (business_discovery). */
async function instagramCount(link: string | null): Promise<number | null> {
  const token = process.env.META_ACCESS_TOKEN, me = process.env.META_IG_USER_ID;
  const h = handleOf(link, /(^|\.)instagram\.com$/);
  if (!token || !me || !h) return null;
  const url = new URL(`${(process.env.META_API_BASE || 'https://graph.facebook.com').replace(/\/$/, '')}/${process.env.META_API_VERSION || 'v21.0'}/${me}`);
  url.searchParams.set('fields', `business_discovery.username(${h}){followers_count}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  const j = (await res.json().catch(() => null)) as R | null;
  if (!res.ok || !j || j.error) throw new Error(j?.error?.message || `Instagram xatosi (${res.status})`);
  const n = Number(j.business_discovery?.followers_count);
  return Number.isFinite(n) ? n : null;
}

export type FollowersResult = { updated: number; errors: string[] };

export async function syncFollowers(sql: Sql): Promise<FollowersResult> {
  const out: FollowersResult = { updated: 0, errors: [] };
  const ps = await sql<R[]>`select id, name, tg_link, yt_link, ig_link, tg_start, yt_start, ig_start from projects where archived_at is null and status <> 'Tugagan'`;
  for (const p of ps) {
    const jobs: [string, string, () => Promise<number | null>][] = [
      ['tg', 'Telegram', () => telegramCount(p.tg_link)],
      ['yt', 'YouTube', () => youtubeCount(p.yt_link)],
      ['ig', 'Instagram', () => instagramCount(p.ig_link)]
    ];
    for (const [k, label, fn] of jobs) {
      try {
        const n = await fn();
        if (n === null) continue;
        // "boshlang'ich" qiymat bo'sh bo'lsa, birinchi o'lchangan son boshlang'ich bo'ladi
        if (k === 'tg') await sql`update projects set tg_now = ${n}, tg_start = coalesce(tg_start, ${n}) where id = ${p.id}`;
        if (k === 'yt') await sql`update projects set yt_now = ${n}, yt_start = coalesce(yt_start, ${n}) where id = ${p.id}`;
        if (k === 'ig') await sql`update projects set ig_now = ${n}, ig_start = coalesce(ig_start, ${n}) where id = ${p.id}`;
        out.updated++;
      } catch (e) {
        out.errors.push(`${p.name} (${label}): ${(e as Error).message}`);
      }
    }
  }
  return out;
}

/** CPR / byudjet signallari: har kampaniya va signal haftada bir marta PM va Adminlarga yuboriladi. */
export async function adsSignals(sql: Sql, weekKey: string): Promise<number> {
  const rows = await sql<R[]>`select c.*, p.name as project from campaigns c join projects p on p.id = c.project_id where c.status = 'Faol' and p.archived_at is null and p.status = 'Faol'`;
  const byGroup = new Map<string, R[]>();
  for (const c of rows) byGroup.set(`${c.project_id}:${c.goal}`, [...(byGroup.get(`${c.project_id}:${c.goal}`) || []), c]);
  let sent = 0;
  for (const c of rows) {
    const peers = (byGroup.get(`${c.project_id}:${c.goal}`) || []).filter((x) => x.id !== c.id && Number(x.result) > 0 && Number(x.spent) > 0);
    const avg = peers.length ? peers.reduce((s, x) => s + Number(x.spent) / Number(x.result), 0) / peers.length : 0;
    const cpr = Number(c.result) > 0 ? Number(c.spent) / Number(c.result) : 0;
    let sig: [string, string] | null = null;
    const budget = Number(c.daily_budget) || 0;
    if (Number(c.result) === 0 && budget > 0 && Number(c.spent) >= budget * 3) sig = ['nores', `⚠️ <b>Natija yo'q</b>: «${esc(c.name)}» (${esc(c.project)}) — ${Math.round(c.spent).toLocaleString('en-US')} sarflandi, hali natija kelmagan. To'xtatish yoki o'zgartirishni ko'rib chiqing.`];
    else if (avg > 0 && cpr > avg * 1.5) sig = ['cprhigh', `⚠️ <b>CPR yuqori</b>: «${esc(c.name)}» (${esc(c.project)}) — ${Math.round(cpr).toLocaleString('en-US')}, o'xshash kampaniyalar o'rtachasi ${Math.round(avg).toLocaleString('en-US')} (${(cpr / avg).toFixed(1)}×).`];
    else if (avg > 0 && cpr > 0 && cpr < avg * 0.6 && Number(c.result) >= 5) sig = ['cprlow', `💡 <b>Yaxshi natija</b>: «${esc(c.name)}» (${esc(c.project)}) — CPR ${Math.round(cpr).toLocaleString('en-US')}, o'rtachadan ${(avg / cpr).toFixed(1)}× arzon. Byudjetni oshirish mumkin.`];
    if (!sig) continue;
    const ins = await sql`insert into reminder_log (kind, ref, chat_id) values ('ads-signal', ${`${c.id}:${sig[0]}:${weekKey}`}, 0) on conflict do nothing returning kind`;
    if (!ins.length) continue;
    // PM'lar va Adminlar: bir kishi ikkala rolda bo'lsa ham bitta xabar
    const pmChats = await sql<{ telegram_chat_id: string }[]>`
      select m.telegram_chat_id from project_pms pp join members m on m.id = pp.member_id
      where pp.project_id = ${c.project_id} and m.active and m.telegram_status = 'approved' and m.telegram_chat_id is not null`;
    const chats = new Set([...pmChats.map((x) => String(x.telegram_chat_id)), ...(await adminChats(sql)).map(String)]);
    for (const ch of chats) await enqueue(sql, ch, sig[1]);
    sent++;
  }
  return sent;
}

export type SyncStatus = { at: string; meta?: SyncResult; followers?: FollowersResult; signals?: number };

/** Hammasini yangilash va holatni saqlash (cron va qo'lda ishga tushirish uchun). */
export async function syncAll(sql: Sql, weekKey: string): Promise<SyncStatus> {
  const status: SyncStatus = { at: new Date().toISOString() };
  if (metaEnabled()) {
    status.meta = await syncMeta(sql);
    try { status.signals = await adsSignals(sql, weekKey); } catch (e) { status.meta.errors.push('signal: ' + (e as Error).message); }
  }
  status.followers = await syncFollowers(sql);
  await sql`insert into settings (key, value) values ('sync.last', ${sql.json(status as never)}) on conflict (key) do update set value = excluded.value`;
  return status;
}

export async function lastSync(sql: Sql): Promise<SyncStatus | null> {
  const [r] = await sql<{ value: SyncStatus }[]>`select value from settings where key = 'sync.last'`;
  return r?.value ?? null;
}
