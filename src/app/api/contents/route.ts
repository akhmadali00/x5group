import { requireMe } from '@/lib/session';
import { createContent } from '@/lib/services/contents';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    return ok(await createContent(s.me, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
