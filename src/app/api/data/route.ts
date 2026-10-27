import { requireMe } from '@/lib/session';
import { loadDatasets } from '@/lib/data';
import { ok, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await requireMe();
    const { datasets, archived, syncAt } = await loadDatasets(s.me);
    return ok({ datasets, archived, syncAt, me: { name: s.me.name, id: s.me.id } });
  } catch (e) {
    return fail(e);
  }
}
