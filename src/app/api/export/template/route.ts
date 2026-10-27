import { requireMe } from '@/lib/session';
import { templateFile } from '@/lib/services/transfer';
import { fail } from '@/lib/http';

export async function GET(req: Request) {
  try {
    await requireMe();
    const f = await templateFile(new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx');
    return new Response(new Uint8Array(f.buf), { headers: { 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename="${f.name}"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}
