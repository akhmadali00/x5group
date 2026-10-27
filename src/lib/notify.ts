// Voqealar bo'yicha darhol xabarlar. Barcha funksiyalar tranzaksiya ichida chaqiriladi va faqat navbatga yozadi.
import type { Sql } from './db';
import { enqueueToMembers } from './outbox';
import { botEnabled, esc, type Keyboard } from './telegram';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function projectPmIds(tx: Sql, projectId: string): Promise<string[]> {
  const rows = await tx<{ member_id: string }[]>`select member_id from project_pms where project_id = ${projectId}`;
  return rows.map((r) => r.member_id);
}

const dm = (iso: string) => {
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
};

export async function notifyTaskAssigned(tx: Sql, task: R, actorId: string | null) {
  if (!botEnabled()) return;
  const kb: Keyboard = [[{ text: '▶️ Jarayonda', data: `t:${task.id}:p` }, { text: '✅ Tayyor', data: `t:${task.id}:d` }]];
  const note = task.note ? `\n${esc(task.note)}` : '';
  await enqueueToMembers(tx, [task.assignee_id], `📝 <b>Yangi vazifa</b>\n${esc(task.title)}\nMuddat: ${task.duration_days} kun (topshirish: ${dm(task.due_on)})${note}`, kb, actorId);
}

export async function notifyShoot(tx: Sql, shoot: R, kind: 'new' | 'moved' | 'cancelled', actorId: string | null, was?: R) {
  if (!botEnabled()) return;
  const [p] = await tx<{ name: string }[]>`select name from projects where id = ${shoot.project_id}`;
  const pms = await projectPmIds(tx, shoot.project_id);
  const head = kind === 'new' ? '🎬 <b>Yangi syomka</b>' : kind === 'cancelled' ? "❌ <b>Syomka bekor qilindi</b>" : "🔄 <b>Syomka o'zgardi</b>";
  let body = `${esc(p?.name)}\n📍 ${esc(shoot.place)}\n🗓 ${dm(shoot.shoot_date)}, ${esc(shoot.shoot_time)}`;
  if (kind === 'moved' && was) body += `\n(oldin: ${dm(was.shoot_date)}, ${esc(was.shoot_time)}, ${esc(was.place)})`;
  if (shoot.status === "Ko'chirildi" && kind !== 'new') body += "\nHolat: ko'chirildi";
  if (shoot.note) body += `\n📝 ${esc(shoot.note)}`;
  await enqueueToMembers(tx, [shoot.operator_id, shoot.brandface_id, ...pms], `${head}\n${body}`, null, actorId);
}

export const STAGE_NEEDS_APPROVAL: Record<string, { to: string; ok: string }> = {
  "G'oya": { to: 'Ijobiy', ok: '👍 Ijobiy' },
  'Montaj Tayyor': { to: 'Tasdiqlandi', ok: '✅ Tasdiqlandi' }
};

/** G'oya yoki tayyor montaj: loyiha PM lariga tasdiq so'rovi (tugmalar bilan). */
export async function requestApproval(tx: Sql, content: R, actorId: string | null) {
  if (!botEnabled()) return;
  const a = STAGE_NEEDS_APPROVAL[content.stage];
  if (!a) return;
  const [p] = await tx<{ name: string }[]>`select name from projects where id = ${content.project_id}`;
  const [au] = content.author_id ? await tx<{ name: string }[]>`select name from members where id = ${content.author_id}` : [];
  const kb: Keyboard = [[{ text: a.ok, data: `c:${content.id}:y` }, { text: '↩️ Qayta ko\'rish', data: `c:${content.id}:n` }]];
  const text = `🔎 <b>Tasdiq kerak</b>\n${esc(p?.name)} — «${esc(content.title)}»\nBosqich: ${esc(content.stage)}${au ? `\nTayyorladi: ${esc(au.name)}` : ''}`;
  await enqueueToMembers(tx, await projectPmIds(tx, content.project_id), text, kb, actorId);
}

export async function notifyAuthor(tx: Sql, content: R, text: string, actorId: string | null) {
  if (!botEnabled() || !content.author_id) return;
  await enqueueToMembers(tx, [content.author_id], text, null, actorId);
}
