// Meta (Facebook/Instagram) Marketing API: kampaniyalar va kunlik natijalarni avtomatik yangilash.
// Token faqat muhit o'zgaruvchisida (META_ACCESS_TOKEN); brauzerga yoki loglarga chiqmaydi.
import type { Sql } from './db';
import { todayTashkent } from './services/common';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const metaEnabled = () => !!process.env.META_ACCESS_TOKEN;
const base = () => `${(process.env.META_API_BASE || 'https://graph.facebook.com').replace(/\/$/, '')}/${process.env.META_API_VERSION || 'v21.0'}`;

class MetaError extends Error {}

async function get(path: string, params: Record<string, string>): Promise<R> {
  const url = new URL(base() + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30000) });
  const j = (await res.json().catch(() => null)) as R | null;
  if (!res.ok || !j || j.error) throw new MetaError(j?.error?.message || `Meta xatosi (${res.status})`);
  return j;
}

async function getAll(path: string, params: Record<string, string>, maxPages = 10): Promise<R[]> {
  const out: R[] = [];
  let j = await get(path, { limit: '200', ...params });
  for (let i = 0; i < maxPages; i++) {
    out.push(...((j.data as R[]) || []));
    const next = j.paging?.next as string | undefined;
    if (!next) break;
    const res = await fetch(next, { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(30000) });
    j = (await res.json()) as R;
    if (j.error) throw new MetaError(j.error.message);
  }
  return out;
}

const ZERO_OFFSET = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'PYG', 'HUF', 'TWD', 'COP', 'CRC', 'IDR']);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const act = (a: R[] | undefined, ...types: string[]) => (a || []).filter((x) => types.includes(x.action_type)).reduce((s, x) => s + num(x.value), 0);
const vid = (a: R[] | undefined) => num(a?.[0]?.value);

export function accountId(raw: string | null | undefined): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  return d ? `act_${d}` : null;
}

const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.messaging_conversation_started_7d'];
const FOLLOW_TYPES = ['follow', 'page_like', 'like', 'instagram_profile_follow'];

function statusOf(s: string | undefined): string {
  if (s === 'ACTIVE') return 'Faol';
  if (s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED') return "To'xtatilgan";
  if (s === 'DELETED' || s === 'ARCHIVED') return "O'chirilgan";
  return 'Tugatilgan';
}

/** Natija turi: kampaniya maqsadiga qarab. */
export function resultOf(objective: string | undefined, ins: R): { goal: string; type: string; value: number } {
  const leads = act(ins.actions, ...LEAD_TYPES);
  const follows = act(ins.actions, ...FOLLOW_TYPES);
  const thru = vid(ins.video_thruplay_watched_actions);
  const views3 = act(ins.actions, 'video_view');
  const o = String(objective || '');
  if (/LEAD|MESSAGE|SALES|CONVERSION/.test(o)) return { goal: 'LID', type: 'Lid', value: leads };
  if (/FOLLOW|PAGE_LIKES|PROFILE/.test(o)) return { goal: 'Obunachi', type: 'Obunachi', value: follows };
  if (/VIDEO|AWARENESS|REACH|BRAND/.test(o)) return { goal: 'Prosmotr', type: 'ThruPlay', value: thru || views3 };
  // ENGAGEMENT/TRAFFIC va boshqalar: eng ko'p natija bergan turga qarab
  if (leads >= follows && leads > 0) return { goal: 'LID', type: 'Lid', value: leads };
  if (follows > 0) return { goal: 'Obunachi', type: 'Obunachi', value: follows };
  return { goal: 'Prosmotr', type: 'ThruPlay', value: thru || views3 };
}

export type SyncResult = { accounts: number; campaigns: number; days: number; errors: string[] };

export async function syncMeta(sql: Sql, only?: string): Promise<SyncResult> {
  const res: SyncResult = { accounts: 0, campaigns: 0, days: 0, errors: [] };
  if (!metaEnabled()) { res.errors.push('META_ACCESS_TOKEN sozlanmagan'); return res; }
  const projects = await sql<R[]>`select id, name, ad_account from projects where archived_at is null and status <> 'Tugagan' and coalesce(btrim(ad_account), '') <> '' ${only ? sql`and id = ${only}` : sql``}`;
  const today = todayTashkent();
  for (const p of projects) {
    const acct = accountId(p.ad_account);
    if (!acct) continue;
    try {
      const info = await get(`/${acct}`, { fields: 'currency' });
      const div = ZERO_OFFSET.has(String(info.currency)) ? 1 : 100;
      const camps = await getAll(`/${acct}/campaigns`, { fields: 'id,name,effective_status,objective,daily_budget,start_time,created_time' });
      const insRows = await getAll(`/${acct}/insights`, {
        level: 'campaign', date_preset: 'maximum',
        fields: 'campaign_id,spend,impressions,reach,actions,video_thruplay_watched_actions'
      });
      const ins = new Map(insRows.map((x) => [x.campaign_id as string, x]));
      for (const c of camps) {
        const i = ins.get(c.id) || {};
        const r = resultOf(c.objective, i);
        const started = String(c.start_time || c.created_time || '').slice(0, 10) || null;
        const vals = {
          name: String(c.name), started_on: started, status: statusOf(c.effective_status), goal: r.goal,
          daily_budget: c.daily_budget ? num(c.daily_budget) / div : null, spent: num(i.spend), result: r.value, result_type: r.type,
          leads: act(i.actions, ...LEAD_TYPES), views: num(i.impressions), reach: num(i.reach),
          video_3s: act(i.actions, 'video_view'), thruplay: vid(i.video_thruplay_watched_actions), followers: act(i.actions, ...FOLLOW_TYPES)
        };
        const [ex] = await sql<R[]>`select id from campaigns where project_id = ${p.id} and external_id = ${c.id}`;
        if (ex) {
          await sql`update campaigns set name = ${vals.name}, started_on = ${vals.started_on}, status = ${vals.status}, goal = ${vals.goal}, daily_budget = ${vals.daily_budget},
            spent = ${vals.spent}, result = ${vals.result}, result_type = ${vals.result_type}, leads = ${vals.leads}, views = ${vals.views}, reach = ${vals.reach},
            video_3s = ${vals.video_3s}, thruplay = ${vals.thruplay}, followers = ${vals.followers}, source = 'Meta', updated_at = now() where id = ${ex.id}`;
        } else {
          await sql`insert into campaigns (project_id, name, started_on, status, goal, daily_budget, spent, result, result_type, leads, views, reach, video_3s, thruplay, followers, source, external_id)
            values (${p.id}, ${vals.name}, ${vals.started_on}, ${vals.status}, ${vals.goal}, ${vals.daily_budget}, ${vals.spent}, ${vals.result}, ${vals.result_type}, ${vals.leads}, ${vals.views},
              ${vals.reach}, ${vals.video_3s}, ${vals.thruplay}, ${vals.followers}, 'Meta', ${c.id})`;
        }
        res.campaigns++;
      }
      // kunlik natija: oxirgi 14 kun
      const days = await getAll(`/${acct}/insights`, { level: 'account', time_increment: '1', date_preset: 'last_14d', fields: 'spend,actions,date_start' });
      for (const d of days) {
        const day = String(d.date_start);
        const complete = day < today;
        await sql`insert into daily_results (project_id, day, leads, spend, complete) values (${p.id}, ${day}, ${act(d.actions, ...LEAD_TYPES)}, ${num(d.spend)}, ${complete})
          on conflict (project_id, day) do update set leads = excluded.leads, spend = excluded.spend, complete = excluded.complete`;
        res.days++;
      }
      res.accounts++;
    } catch (e) {
      res.errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  return res;
}
