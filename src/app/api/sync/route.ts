import { requireAdmin } from '@/lib/session';
import { db } from '@/lib/db';
import { syncAll, lastSync } from '@/lib/social';
import { metaEnabled } from '@/lib/meta';
import { ok, fail, csrfGuard } from '@/lib/http';
import { addDays } from '@/lib/services/common';
import { localParts } from '@/lib/reminders';

export const maxDuration = 60;

/** Admin: tashqi ma'lumotlar holati (Meta, obunachilar). */
export async function GET() {
  try {
    await requireAdmin();
    return ok({ meta: metaEnabled(), youtube: !!process.env.YOUTUBE_API_KEY, instagram: !!process.env.META_IG_USER_ID && metaEnabled(), last: await lastSync(db()) });
  } catch (e) {
    return fail(e);
  }
}

/** Admin: hozir yangilash. */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    await requireAdmin();
    const t = localParts();
    return ok(await syncAll(db(), addDays(t.date, -((t.dow + 6) % 7))));
  } catch (e) {
    return fail(e);
  }
}
