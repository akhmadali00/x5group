import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/session';
import { restoreFromBackupId, toFile, type BackupData } from '@/lib/backup';
import { ok, fail, csrfGuard, notFound } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

/** Zaxirani fayl sifatida yuklab olish (sirlarsiz; BACKUP_KEY bo'lsa shifrlangan sirlar bilan). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const [b] = await db()<{ data: BackupData; created_at: Date }[]>`select data, created_at from backups where id = ${Number(id)}`;
    if (!b) throw notFound('Zaxira topilmadi');
    const iso = new Date(b.created_at).toISOString();
    return new NextResponse(toFile(b.data, iso), {
      headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="x5group-zaxira-${iso.slice(0, 10)}.json"`, 'cache-control': 'no-store' }
    });
  } catch (e) {
    return fail(e);
  }
}

/** Zaxiradan tiklash (faqat Admin). Avval joriy holatdan "pre-restore" nusxa olinadi. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    csrfGuard(req);
    const s = await requireAdmin();
    const { id } = await ctx.params;
    return ok(await restoreFromBackupId(s.me, Number(id)));
  } catch (e) {
    return fail(e);
  }
}
