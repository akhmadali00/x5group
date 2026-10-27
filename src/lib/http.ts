import { NextResponse, after } from 'next/server';
import { flushOutbox } from './outbox';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const bad = (m = "So'rov noto'g'ri") => new HttpError(400, m);
export const unauthorized = (m = 'Kirish talab qilinadi') => new HttpError(401, m);
export const forbidden = (m = "Bu amal uchun ruxsat yo'q") => new HttpError(403, m);
export const notFound = (m = 'Topilmadi') => new HttpError(404, m);

export function ok(data: unknown = { ok: true }, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) } });
}

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json({ error: first ? `${first.path.join('.') || 'maydon'}: ${first.message}` : "Ma'lumot noto'g'ri" }, { status: 400 });
  }
  console.error('[x5] server xatosi:', e);
  return NextResponse.json({ error: 'Server xatosi. Qayta urinib ko\'ring.' }, { status: 500 });
}

/**
 * CSRF himoyasi: o'zgartiruvchi so'rovlar faqat o'z saytimizdan kelishi kerak.
 * (Cookie SameSite=Lax + Origin tekshiruvi + maxsus sarlavha.)
 */
export function csrfGuard(req: Request) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  // javob yuborilgach, o'zgarish bilan birga navbatga tushgan Telegram xabarlari jo'natiladi
  try { after(() => flushOutbox().catch(() => {})); } catch { /* so'rov doirasidan tashqarida */ }
  if (req.headers.get('x-x5') !== '1') throw forbidden('Noto\'g\'ri so\'rov manbai');
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    let oh = '';
    try { oh = new URL(origin).host; } catch { /* noto'g'ri origin */ }
    if (!host || oh !== host) throw forbidden("Noto'g'ri so'rov manbai");
  }
}

export function clientIp(req: Request): string {
  const f = req.headers.get('x-forwarded-for');
  return (f ? f.split(',')[0] : req.headers.get('x-real-ip') || '').trim() || 'unknown';
}
