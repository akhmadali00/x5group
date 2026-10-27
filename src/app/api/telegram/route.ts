import { NextResponse, after } from 'next/server';

export const maxDuration = 60;
import { handleUpdate } from '@/lib/bot';
import { flushOutbox } from '@/lib/outbox';
import { botEnabled } from '@/lib/telegram';
import { safeEqual } from '@/lib/crypto';

/** Telegram webhook. Maxfiy sarlavha (X-Telegram-Bot-Api-Secret-Token) bilan himoyalangan. */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const got = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!botEnabled() || !secret || !safeEqual(got, secret)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const update = await req.json();
    await handleUpdate(update);
  } catch (e) {
    // Telegram qayta-qayta yuborib yubormasligi uchun har doim 200 qaytaramiz
    console.error('[x5] bot xatosi:', e);
  }
  after(() => flushOutbox().catch(() => {}));
  return NextResponse.json({ ok: true });
}
