import { requireMe } from '@/lib/session';
import { revertEntry } from '@/lib/services/history';
import { ok, fail, csrfGuard } from '@/lib/http';

/** POST /api/audit/:id  — o'zgarishni qaytarish (faqat Admin) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n)) throw new Error('bad id');
    return ok(await revertEntry(s.me, n));
  } catch (e) {
    return fail(e);
  }
}
