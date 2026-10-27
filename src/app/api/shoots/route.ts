import { requireMe } from '@/lib/session';
import { createShoot } from '@/lib/services/shoots';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    return ok(await createShoot(s.me, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
