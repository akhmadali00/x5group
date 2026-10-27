import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const timed = async (p: () => Promise<unknown>, limit = 12000) => {
  const t = Date.now();
  try {
    await Promise.race([p(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), limit))]);
    return Date.now() - t;
  } catch (e) {
    return `xato: ${(e as Error).message.slice(0, 80)} (${Date.now() - t}ms)`;
  }
};

/** Aloqa tezligi tekshiruvi: faqat millisekundlar va hudud ko'rsatiladi (hech qanday ma'lumot yoki sir yo'q). */
export async function GET() {
  const sql = db();
  const out: Record<string, unknown> = { region: process.env.VERCEL_REGION || 'local' };
  out.first_query_ms = await timed(() => sql`select 1`);
  out.next_queries_ms = [await timed(() => sql`select 1`), await timed(() => sql`select 1`), await timed(() => sql`select 1`)];
  out.five_parallel_ms = await timed(() => Promise.all([1, 2, 3, 4, 5].map(() => sql`select 1`)));
  out.tables_ms = await timed(() => sql`select (select count(*) from members), (select count(*) from contents), (select count(*) from audit_log)`);
  out.data_load_ms = await timed(async () => {
    await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(() => sql`select 1`));
  });
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
