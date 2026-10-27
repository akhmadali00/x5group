import { z } from 'zod';
import { requireAdmin } from '@/lib/session';
import { parseBackupFile, restoreData } from '@/lib/backup';
import { ok, fail, csrfGuard } from '@/lib/http';

/** Yuklangan zaxira faylidan tiklash (faqat Admin). */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireAdmin();
    const b = z.object({ file: z.string().min(2).max(20_000_000) }).parse(await req.json());
    const { data, secrets } = parseBackupFile(b.file);
    return ok(await restoreData(s.me, data, secrets, 'fayldan'));
  } catch (e) {
    return fail(e);
  }
}
