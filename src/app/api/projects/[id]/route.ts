import { requireMe } from '@/lib/session';
import { updateProject } from '@/lib/services/projects';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    const { id } = await ctx.params;
    return ok(await updateProject(s.me, id, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
