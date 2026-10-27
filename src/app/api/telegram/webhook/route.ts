import { requireAdmin } from '@/lib/session';
import { botEnabled, botUsername, setWebhook, tg } from '@/lib/telegram';
import { ok, fail, csrfGuard, bad } from '@/lib/http';
import { db } from '@/lib/db';

type Info = { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number };

/** Bot holati: token bormi, webhook o'rnatilganmi, oxirgi xato. */
export async function GET() {
  try {
    await requireAdmin();
    const env = {
      token: botEnabled(),
      secret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      cron: !!process.env.CRON_SECRET,
      ai: !!process.env.ANTHROPIC_API_KEY,
      backupKey: !!process.env.BACKUP_KEY
    };
    let webhook: Info | null = null;
    let me: { username?: string } | null = null;
    let error: string | null = null;
    if (env.token) {
      try {
        webhook = await tg<Info>('getWebhookInfo', {});
        me = await tg<{ username?: string }>('getMe', {});
      } catch (e) { error = (e as Error).message; }
    }
    const [q] = await db()<{ n: number }[]>`select count(*)::int n from outbox where sent_at is null and attempts < 5`;
    return ok({ env, username: me?.username || botUsername(), webhookUrl: webhook?.url || '', pending: webhook?.pending_update_count ?? 0, lastError: webhook?.last_error_message || error, queue: q.n });
  } catch (e) {
    return fail(e);
  }
}

/** Webhookni shu sayt manziliga o'rnatadi (Telegram yangilanishlari /api/telegram ga keladi). */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    await requireAdmin();
    if (!botEnabled()) throw bad("TELEGRAM_BOT_TOKEN o'rnatilmagan");
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) throw bad("TELEGRAM_WEBHOOK_SECRET o'rnatilmagan");
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const base = (process.env.APP_URL || `${proto}://${host}`).replace(/\/$/, '');
    if (!base.startsWith('https://')) throw bad('Telegram webhook faqat https manzilda ishlaydi (Vercel manzilida ochib qayta urining)');
    await setWebhook(`${base}/api/telegram`, secret);
    return ok({ url: `${base}/api/telegram` });
  } catch (e) {
    return fail(e);
  }
}
