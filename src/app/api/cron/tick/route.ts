import { NextResponse } from 'next/server';
import { runTick } from '@/lib/reminders';
import { safeEqual } from '@/lib/crypto';

export const maxDuration = 60;

/** Har daqiqada chaqiriladi (Supabase pg_cron yoki Vercel Cron). Himoya: Authorization: Bearer CRON_SECRET */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !safeEqual(got, secret)) return NextResponse.json({ ok: false }, { status: 401 });
  // sinov uchun: ?now=ISO faqat ishlab chiqarishdan tashqarida
  const nowQ = process.env.NODE_ENV !== 'production' ? new URL(req.url).searchParams.get('now') : null;
  const r = await runTick(nowQ ? new Date(nowQ) : new Date());
  return NextResponse.json({ ok: true, ...r });
}
export const GET = handle;
export const POST = handle;
