import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { createBackup } from '@/lib/backup';
import { ok, fail, csrfGuard } from '@/lib/http';

/** Qo'lda zaxira nusxa olish (faqat Admin). */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireAdmin();
    const r = await createBackup(db(), 'manual', { id: s.me.id, name: s.me.name });
    return ok(r);
  } catch (e) {
    return fail(e);
  }
}
