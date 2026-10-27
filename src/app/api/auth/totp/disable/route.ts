import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyPassword, verifyTotp } from '@/lib/crypto';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { ok, fail, csrfGuard, bad } from '@/lib/http';

/** O'chirish uchun parol va joriy kod ikkalasi ham kerak. */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireAdmin();
    const b = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(10) }).parse(await req.json());
    const sql = db();
    const [m] = await sql<{ password_hash: string | null; totp_secret: string | null }[]>`select password_hash, totp_secret from members where id = ${s.me.id}`;
    if (!(await verifyPassword(b.password, m?.password_hash)) || !m?.totp_secret || !verifyTotp(m.totp_secret, b.code)) throw bad("Parol yoki kod noto'g'ri");
    await sql`update members set totp_enabled = false, totp_secret = null where id = ${s.me.id}`;
    await audit(sql, { actor: { id: s.me.id, name: s.me.name }, action: 'update', entity: 'security', entityId: s.me.id, summary: `${s.me.name}: 2 bosqichli kirish o'chirildi` });
    return ok();
  } catch (e) {
    return fail(e);
  }
}
