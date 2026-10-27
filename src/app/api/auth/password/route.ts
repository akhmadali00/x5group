import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { ok, fail, csrfGuard, HttpError } from '@/lib/http';

const Body = z.object({ current: z.string().min(1).max(200), next: z.string().min(8, "Yangi parol kamida 8 belgi bo'lsin").max(200) });

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const b = Body.parse(await req.json());
    const s = await requireMe();
    const sql = db();
    const [m] = await sql<{ password_hash: string | null }[]>`select password_hash from members where id = ${s.me.id}`;
    if (!(await verifyPassword(b.current, m?.password_hash))) throw new HttpError(401, "Joriy parol noto'g'ri");
    const hash = await hashPassword(b.next);
    await sql`update members set password_hash = ${hash} where id = ${s.me.id}`;
    // boshqa qurilmalardagi sessiyalarni yopamiz
    await sql`delete from sessions where member_id = ${s.me.id} and token_hash <> ${s.tokenHash}`;
    await audit(sql, { actor: { id: s.me.id, name: s.me.name }, action: 'update', entity: 'password', entityId: s.me.id, summary: `${s.me.name} parolini almashtirdi` });
    return ok();
  } catch (e) {
    return fail(e);
  }
}
