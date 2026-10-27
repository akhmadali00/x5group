import { z } from 'zod';
import { requireMe } from '@/lib/session';
import { archiveItem } from '@/lib/services/archive';
import { ok, fail, csrfGuard } from '@/lib/http';

const Body = z.object({ kind: z.string(), id: z.string().uuid(), restore: z.boolean().default(false) });

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    const b = Body.parse(await req.json());
    return ok(await archiveItem(s.me, b.kind, b.id, b.restore));
  } catch (e) {
    return fail(e);
  }
}
