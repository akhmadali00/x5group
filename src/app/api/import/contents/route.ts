import { requireMe } from '@/lib/session';
import { importContents } from '@/lib/services/transfer';
import { ok, fail, csrfGuard } from '@/lib/http';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    return ok(await importContents(s.me, await req.json()));
  } catch (e) {
    return fail(e);
  }
}
