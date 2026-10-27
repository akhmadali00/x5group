import { requireMe } from '@/lib/session';
import { createTask } from '@/lib/services/tasks';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    return ok(await createTask(s.me, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
