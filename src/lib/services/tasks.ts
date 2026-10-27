import { z } from 'zod';
import { db } from '../db';
import { audit } from '../audit';
import { bad, forbidden, notFound } from '../http';
import { isAdmin, type Me } from '../perm';
import { notifyTaskAssigned } from '../notify';
import { addDays, memberIdByName, snapshot, todayTashkent, zInt, zStr } from './common';

const Status = z.enum(['Boshlanmagan', 'Jarayonda', 'Tayyor', 'Tugatildi']);

export const TaskBody = z.object({
  assignee: z.string().trim().min(1, 'Kimga ekanini tanlang'),
  title: z.string().trim().min(1, 'Vazifa nomini kiriting').max(300),
  durationDays: zInt(1, 365).refine((v) => v !== null, 'Muddatni kiriting'),
  note: zStr(4000),
  status: Status.default('Boshlanmagan')
});

export async function createTask(me: Me, input: unknown) {
  if (!isAdmin(me)) throw forbidden('Vazifani faqat Admin qo\'shadi');
  const b = TaskBody.parse(input);
  const sql = db();
  const id = await sql.begin(async (tx) => {
    const who = await memberIdByName(tx as never, b.assignee);
    const today = todayTashkent();
    const [row] = await tx`
      insert into tasks (assignee_id, title, note, assigned_on, duration_days, due_on, status, created_by)
      values (${who}, ${b.title}, ${b.note}, ${today}, ${b.durationDays}, ${addDays(today, b.durationDays!)}, ${b.status}, ${me.id}) returning *`;
    await audit(tx as never, { actor: me, action: 'create', entity: 'task', entityId: row.id, summary: `Yangi vazifa: «${b.title}» → ${b.assignee}`, after: snapshot(row) });
    await notifyTaskAssigned(tx as never, row, me.id);
    return row.id as string;
  });
  return { id };
}

export async function updateTask(me: Me, id: string, input: unknown) {
  const sql = db();
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from tasks where id = ${id} and archived_at is null for update`;
    if (!before) throw notFound('Vazifa topilmadi');
    const own = before.assignee_id === me.id;
    if (!isAdmin(me) && !own) throw forbidden();
    const patch = z
      .object({ assignee: z.string().optional(), title: z.string().trim().min(1).max(300).optional(), durationDays: zInt(1, 365).optional(), note: zStr(4000).optional(), status: Status.optional() })
      .parse(input);
    let { assignee_id, title, duration_days, due_on, assigned_on } = before as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (isAdmin(me)) {
      if (patch.assignee) assignee_id = await memberIdByName(tx as never, patch.assignee);
      if (patch.title) title = patch.title;
      if (patch.durationDays && patch.durationDays !== duration_days) {
        duration_days = patch.durationDays;
        assigned_on = todayTashkent();
        due_on = addDays(assigned_on, duration_days);
      }
    }
    const note = patch.note !== undefined ? patch.note : before.note;
    const status = patch.status ?? before.status;
    const finished = status === 'Tayyor' || status === 'Tugatildi';
    const [row] = await tx`
      update tasks set assignee_id = ${assignee_id}, title = ${title}, duration_days = ${duration_days}, due_on = ${due_on}, assigned_on = ${assigned_on},
        note = ${note}, status = ${status},
        done_at = ${finished ? before.done_at ?? new Date() : null}
      where id = ${id} returning *`;
    if (before.assignee_id !== row.assignee_id) await notifyTaskAssigned(tx as never, row, me.id);
    const st = before.status !== row.status ? ` (${before.status} → ${row.status})` : '';
    await audit(tx as never, { actor: me, action: 'update', entity: 'task', entityId: id, summary: `Vazifa yangilandi: «${row.title}»${st}`, before: snapshot(before), after: snapshot(row) });
  });
  return { ok: true };
}

void bad;
