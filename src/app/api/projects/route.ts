import { requireMe } from '@/lib/session';
import { createProject } from '@/lib/services/projects';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    return ok(await createProject(s.me, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
