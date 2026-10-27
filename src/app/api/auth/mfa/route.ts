import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyTotp } from '@/lib/crypto';
import { currentSession } from '@/lib/session';
import { assertNotLocked, recordAttempt } from '@/lib/ratelimit';
import { ok, fail, csrfGuard, clientIp, unauthorized, HttpError } from '@/lib/http';

const Body = z.object({ code: z.string().trim().min(6).max(10) });

/** Paroldan keyingi 2-bosqich (faqat Admin uchun yoqilgan bo'lsa). */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const b = Body.parse(await req.json());
    const s = await currentSession();
    if (!s) throw unauthorized();
    const key = 'mfa:' + s.me.id;
    const ip = clientIp(req);
    await assertNotLocked(key, ip);
    const sql = db();
    const [m] = await sql<{ totp_secret: string | null }[]>`select totp_secret from members where id = ${s.me.id} and totp_enabled`;
    if (!m?.totp_secret || !verifyTotp(m.totp_secret, b.code)) {
      await recordAttempt(key, ip, false);
      throw new HttpError(401, "Kod noto'g'ri");
    }
    await recordAttempt(key, ip, true);
    await sql`update sessions set mfa_ok = true where token_hash = ${s.tokenHash}`;
    return ok({ state: 'ok' });
  } catch (e) {
    return fail(e);
  }
}
