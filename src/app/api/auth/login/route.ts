import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword } from '@/lib/crypto';
import { startSession } from '@/lib/session';
import { assertNotLocked, recordAttempt } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { ok, fail, csrfGuard, clientIp, HttpError } from '@/lib/http';

const Body = z.object({ email: z.string().trim().toLowerCase().min(3).max(200), password: z.string().min(1).max(200) });

// Hisob topilmasa ham xesh hisoblanadi (vaqt orqali hisob borligini bilib bo'lmasligi uchun)
let dummy: Promise<string> | null = null;

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const b = Body.parse(await req.json());
    const ip = clientIp(req);
    await assertNotLocked(b.email, ip);
    const sql = db();
    const [m] = await sql<{ id: string; name: string; password_hash: string | null; role: string; totp_enabled: boolean }[]>`
      select id, name, password_hash, role, totp_enabled from members
      where lower(email) = ${b.email} and kind = 'account' and active`;
    dummy ??= hashPassword('dummy-password');
    const good = await verifyPassword(b.password, m?.password_hash ?? (await dummy));
    if (!m || !good) {
      await recordAttempt(b.email, ip, false);
      throw new HttpError(401, "Email yoki parol noto'g'ri");
    }
    await recordAttempt(b.email, ip, true);
    const needMfa = m.role === 'admin' && m.totp_enabled;
    await startSession(m.id, !needMfa, req.headers.get('user-agent'));
    await audit(sql, { actor: { id: m.id, name: m.name }, action: 'login', entity: 'session', entityId: m.id, summary: `${m.name} tizimga kirdi` });
    return ok({ state: needMfa ? 'mfa' : 'ok' });
  } catch (e) {
    return fail(e);
  }
}
