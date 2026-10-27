import { requireMe } from '@/lib/session';
import { exportContents } from '@/lib/services/transfer';
import { fail, csrfGuard } from '@/lib/http';

export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    const f = await exportContents(s.me, await req.json());
    return new Response(new Uint8Array(f.buf), {
      headers: { 'Content-Type': f.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'no-store', 'X-Count': String(f.count) }
    });
  } catch (e) {
    return fail(e);
  }
}
