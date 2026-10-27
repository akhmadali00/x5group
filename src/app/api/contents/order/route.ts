import { requireMe } from '@/lib/session';
import { reorderContents } from '@/lib/services/contents';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function PUT(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    return ok(await reorderContents(s.me, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
