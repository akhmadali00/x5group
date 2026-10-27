import { endSession } from '@/lib/session';
import { ok, fail, csrfGuard } from '@/lib/http';

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    await endSession();
    return ok();
  } catch (e) {
    return fail(e);
  }
}
