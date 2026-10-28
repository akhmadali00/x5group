import { z } from 'zod';
import { db } from '../db';
import { audit } from '../audit';
import { bad, forbidden, notFound } from '../http';
import { isAdmin, type Me } from '../perm';
import { memberIdsByNames, nul, snapshot, zDate, zInt, zStr } from './common';

const Status = z.enum(['Faol', 'Muzlatilgan', 'Tugagan']);

export const ProjectBody = z.object({
  name: z.string().trim().min(1, 'Loyiha nomini kiriting').max(100),
  status: Status.default('Faol'),
  pms: z.array(z.string()).default([]),
  contractStart: zDate,
  contractMonths: zInt(1, 60),
  planTotal: zInt(0, 100000),
  targetPlan: zInt(0, 100000),
  ownerName: zStr(120),
  ownerPhone: zStr(40),
  ownerTelegram: zStr(80),
  ownerInstagram: zStr(80),
  igLink: zStr(300),
  igStart: zInt(),
  tgLink: zStr(300),
  tgStart: zInt(),
  ytLink: zStr(300),
  ytStart: zInt(),
  reachStart: zInt(0, 2_000_000_000),
  reachNow: zInt(0, 2_000_000_000),
  adsSource: zStr(60),
  adAccount: zStr(120),
  portfolio: zStr(120)
});

export const ProjectPatch = ProjectBody.omit({ name: true });

function checkLinks(b: { igLink: string | null; tgLink: string | null; ytLink: string | null }) {
  for (const v of [b.igLink, b.tgLink, b.ytLink]) {
    if (v && /^(javascript|data|vbscript):/i.test(v)) throw bad("Havola noto'g'ri");
  }
}

export async function createProject(me: Me, input: unknown) {
  if (!isAdmin(me)) throw forbidden('Loyihani faqat Admin qo\'shadi');
  const b = ProjectBody.parse(input);
  checkLinks(b);
  const sql = db();
  const created = await sql.begin(async (tx) => {
    const pmIds = await memberIdsByNames(tx as never, b.pms);
    let row;
    try {
      [row] = await tx`
        insert into projects (name, status, contract_start, contract_months, plan_total, target_plan, owner_name, owner_phone, owner_telegram, owner_instagram,
          ig_link, tg_link, yt_link, ig_start, ig_now, tg_start, tg_now, yt_start, yt_now, reach_start, reach_now, ads_source, ad_account, portfolio)
        values (${b.name}, ${b.status}, ${b.contractStart}, ${b.contractMonths}, ${b.planTotal}, ${b.targetPlan}, ${b.ownerName}, ${b.ownerPhone}, ${b.ownerTelegram}, ${b.ownerInstagram},
          ${b.igLink}, ${b.tgLink}, ${b.ytLink}, ${b.igStart}, ${b.igStart}, ${b.tgStart}, ${b.tgStart}, ${b.ytStart}, ${b.ytStart}, ${b.reachStart}, ${b.reachStart}, ${b.adsSource}, ${b.adAccount}, ${b.portfolio})
        returning *`;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw bad('Bunday nomli loyiha bor');
      throw e;
    }
    for (const id of pmIds) await tx`insert into project_pms (project_id, member_id) values (${row.id}, ${id}) on conflict do nothing`;
    await tx`insert into project_stages (project_id) values (${row.id}) on conflict do nothing`;
    await audit(tx as never, { actor: me, action: 'create', entity: 'project', entityId: row.id, summary: `Yangi loyiha qo'shildi: ${b.name}`, after: snapshot(row) });
    return row;
  });
  return { id: created.id as string };
}

export async function updateProject(me: Me, id: string, input: unknown) {
  if (!isAdmin(me)) throw forbidden('Loyihani faqat Admin tahrirlaydi');
  const b = ProjectPatch.parse(input);
  checkLinks(b);
  const sql = db();
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from projects where id = ${id} and archived_at is null for update`;
    if (!before) throw notFound('Loyiha topilmadi');
    const pmIds = await memberIdsByNames(tx as never, b.pms);
    const [row] = await tx`
      update projects set status = ${b.status}, contract_start = ${b.contractStart}, contract_months = ${b.contractMonths}, plan_total = ${b.planTotal},
        target_plan = ${b.targetPlan}, owner_name = ${b.ownerName}, owner_phone = ${b.ownerPhone}, owner_telegram = ${b.ownerTelegram}, owner_instagram = ${b.ownerInstagram},
        ig_link = ${b.igLink}, tg_link = ${b.tgLink}, yt_link = ${b.ytLink},
        ig_start = ${b.igStart}, tg_start = ${b.tgStart}, yt_start = ${b.ytStart}, reach_start = ${b.reachStart},
        ig_now = coalesce(ig_now, ${b.igStart}), tg_now = coalesce(tg_now, ${b.tgStart}), yt_now = coalesce(yt_now, ${b.ytStart}), reach_now = coalesce(${b.reachNow}, reach_now, ${b.reachStart}),
        ads_source = ${b.adsSource}, ad_account = ${b.adAccount}, portfolio = ${b.portfolio}
      where id = ${id} returning *`;
    await tx`delete from project_pms where project_id = ${id}`;
    for (const m of pmIds) await tx`insert into project_pms (project_id, member_id) values (${id}, ${m})`;
    const changed = before.status !== row.status ? ` (holati: ${before.status} → ${row.status})` : '';
    await audit(tx as never, { actor: me, action: 'update', entity: 'project', entityId: id, summary: `Loyiha tahrirlandi: ${row.name}${changed}`, before: snapshot(before), after: snapshot(row) });
  });
  return { ok: true };
}

/** Bosqich sonlari (G'oyalar, Skript, Montaj, Joylangan, Rekda) */
export const StagesBody = z.object({
  ideas: zInt(0, 100000), scripts: zInt(0, 100000), editing: zInt(0, 100000), posted: zInt(0, 100000), rekda: zInt(0, 100000)
});
export async function updateStages(me: Me, projectId: string, input: unknown) {
  const b = StagesBody.parse(input);
  const sql = db();
  if (!isAdmin(me) && !me.projectIds.has(projectId)) throw forbidden();
  await sql.begin(async (tx) => {
    const [p] = await tx`select name from projects where id = ${projectId} and archived_at is null`;
    if (!p) throw notFound('Loyiha topilmadi');
    const [before] = await tx`select * from project_stages where project_id = ${projectId}`;
    const [row] = await tx`
      insert into project_stages (project_id, ideas, scripts, editing, posted, rekda)
      values (${projectId}, ${b.ideas ?? 0}, ${b.scripts ?? 0}, ${b.editing ?? 0}, ${b.posted ?? 0}, ${b.rekda ?? 0})
      on conflict (project_id) do update set ideas = excluded.ideas, scripts = excluded.scripts, editing = excluded.editing, posted = excluded.posted, rekda = excluded.rekda
      returning *`;
    await audit(tx as never, { actor: me, action: 'update', entity: 'stages', entityId: projectId, summary: `${p.name}: bosqich sonlari yangilandi`, before: snapshot(before), after: snapshot(row) });
  });
  return { ok: true };
}

void nul;
