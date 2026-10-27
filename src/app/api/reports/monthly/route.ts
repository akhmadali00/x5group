import { requireMe } from '@/lib/session';
import { isAdmin } from '@/lib/perm';
import { db } from '@/lib/db';
import { monthlyReportPdf } from '@/lib/monthlyReport';
import { forbidden, bad, fail } from '@/lib/http';

export const maxDuration = 60;

/** Admin: oylik PDF hisobotni yuklab olish. ?month=YYYY-MM */
export async function GET(req: Request) {
  try {
    const s = await requireMe();
    if (!isAdmin(s.me)) throw forbidden('Hisobotni faqat Admin ko\'ra oladi');
    const month = new URL(req.url).searchParams.get('month') || '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad("Oy noto'g'ri (YYYY-MM)");
    const r = await monthlyReportPdf(db(), month);
    return new Response(new Uint8Array(r.buf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${r.name}"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}
