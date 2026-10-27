import { requireMe } from '@/lib/session';
import { updateMember } from '@/lib/services/members';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    const { id } = await ctx.params;
    return ok(await updateMember(s.me, id, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
