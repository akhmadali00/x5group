import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyTotp } from '@/lib/crypto';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { ok, fail, csrfGuard, bad } from '@/lib/http';

/** Ilovadagi 6 xonali kodni tekshirib, 2 bosqichli kirishni yoqadi. */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireAdmin();
    const { code } = z.object({ code: z.string().trim().min(6).max(10) }).parse(await req.json());
    const sql = db();
    const [m] = await sql<{ totp_secret: string | null }[]>`select totp_secret from members where id = ${s.me.id}`;
    if (!m?.totp_secret) throw bad('Avval sozlashni boshlang');
    if (!verifyTotp(m.totp_secret, code)) throw bad("Kod noto'g'ri. Ilovadagi yangi kodni kiriting.");
    await sql`update members set totp_enabled = true where id = ${s.me.id}`;
    await sql`update sessions set mfa_ok = true where token_hash = ${s.tokenHash}`;
    await audit(sql, { actor: { id: s.me.id, name: s.me.name }, action: 'update', entity: 'security', entityId: s.me.id, summary: `${s.me.name}: 2 bosqichli kirish yoqildi` });
    return ok();
  } catch (e) {
    return fail(e);
  }
}
