import { z } from 'zod';
import { requireMe } from '@/lib/session';
import { setMemberActive } from '@/lib/services/members';
import { ok, fail, csrfGuard } from '@/lib/http';

const Body = z.object({ active: z.boolean() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    const { id } = await ctx.params;
    const b = Body.parse(await req.json());
    return ok(await setMemberActive(s.me, id, b.active));
  } catch (e) {
    return fail(e);
  }
}
