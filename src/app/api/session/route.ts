import { db } from '@/lib/db';
import { currentSession } from '@/lib/session';
import { isAdmin } from '@/lib/perm';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Brauzer ishga tushganda: kim kirgan, yoki Admin yaratish / login kerakmi. */
export async function GET() {
  try {
    const s = await currentSession();
    if (!s) {
      const [r] = await db()<{ need: boolean }[]>`select not exists (select 1 from members where kind = 'account') as need`;
      return ok({ state: r.need ? 'setup' : 'login' });
    }
    if (s.me.role === 'admin' && s.totpEnabled && !s.mfaOk) return ok({ state: 'mfa' });
    return ok({
      state: 'ok',
      me: { name: s.me.name, email: s.email, admin: isAdmin(s.me), position: s.me.position, totpEnabled: s.totpEnabled }
    });
  } catch (e) {
    return fail(e);
  }
}
