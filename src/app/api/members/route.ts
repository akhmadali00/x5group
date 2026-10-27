import { requireMe } from '@/lib/session';
import { createMember } from '@/lib/services/members';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    return ok(await createMember(s.me, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
