import { z } from 'zod';
import { db } from '../db';
import { audit } from '../audit';
import { forbidden, notFound } from '../http';
import { isAdmin, type Me } from '../perm';
import { memberIdByName, projectByName, snapshot, zStr } from './common';

const Status = z.enum(['Rejada', 'Tugatildi', "Bekor bo'ldi", "Ko'chirildi"]);

export const ShootBody = z.object({
  project: z.string().trim().min(1, 'Mijozni tanlang'),
  place: z.string().trim().min(1, 'Joyni kiriting').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sanani kiriting'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Soatni kiriting'),
  operator: z.string().trim().min(1, 'Operatorni tanlang'),
  brandface: zStr(100),
  status: Status.default('Rejada'),
  note: zStr(1000)
});

export async function createShoot(me: Me, input: unknown) {
  if (!isAdmin(me)) throw forbidden("Syomkani faqat Admin qo'shadi");
  const b = ShootBody.parse(input);
  const sql = db();
  const id = await sql.begin(async (tx) => {
    const p = await projectByName(tx as never, b.project);
    const op = await memberIdByName(tx as never, b.operator);
    const bf = await memberIdByName(tx as never, b.brandface);
    const [row] = await tx`
      insert into shoots (project_id, place, shoot_date, shoot_time, operator_id, brandface_id, status, note, created_by)
      values (${p.id}, ${b.place}, ${b.date}, ${b.time}, ${op}, ${bf}, ${b.status}, ${b.note}, ${me.id}) returning *`;
    await audit(tx as never, { actor: me, action: 'create', entity: 'shoot', entityId: row.id, summary: `Yangi syomka: ${p.name}, ${b.date} ${b.time}, ${b.place}`, after: snapshot(row) });
    return row.id as string;
  });
  return { id };
}

export async function updateShoot(me: Me, id: string, input: unknown) {
  if (!isAdmin(me)) throw forbidden('Syomkani faqat Admin tahrirlaydi');
  const b = ShootBody.parse(input);
  const sql = db();
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from shoots where id = ${id} and archived_at is null for update`;
    if (!before) throw notFound('Syomka topilmadi');
    const p = await projectByName(tx as never, b.project);
    const op = await memberIdByName(tx as never, b.operator);
    const bf = await memberIdByName(tx as never, b.brandface);
    const [row] = await tx`
      update shoots set project_id = ${p.id}, place = ${b.place}, shoot_date = ${b.date}, shoot_time = ${b.time}, operator_id = ${op}, brandface_id = ${bf},
        status = ${b.status}, note = ${b.note} where id = ${id} returning *`;
    const parts: string[] = [];
    if (before.status !== row.status) parts.push(`holat: ${before.status} → ${row.status}`);
    if (before.shoot_date !== row.shoot_date || before.shoot_time !== row.shoot_time) parts.push(`vaqt: ${before.shoot_date} ${before.shoot_time} → ${row.shoot_date} ${row.shoot_time}`);
    await audit(tx as never, { actor: me, action: 'update', entity: 'shoot', entityId: id, summary: `Syomka yangilandi: ${p.name}${parts.length ? ' (' + parts.join('; ') + ')' : ''}`, before: snapshot(before), after: snapshot(row) });
  });
  return { ok: true };
}
