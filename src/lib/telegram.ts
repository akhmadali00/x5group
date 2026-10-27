// Telegram Bot API bilan ishlash (faqat server). Token faqat muhit o'zgaruvchisidan olinadi.
export type Button = { text: string; data?: string; url?: string };
export type Keyboard = Button[][];

export const botEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const botUsername = () => (process.env.TELEGRAM_BOT_USERNAME || 'x5group_ai_bot').replace(/^@/, '');

const api = () => `${process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export class TgError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${api()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const j = (await res.json().catch(() => null)) as { ok: boolean; result: T; description?: string; error_code?: number } | null;
  if (!j || !j.ok) throw new TgError(j?.error_code || res.status, j?.description || `Telegram xatosi (${res.status})`);
  return j.result;
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function replyMarkup(kb?: Keyboard | null) {
  if (!kb || !kb.length) return undefined;
  return { inline_keyboard: kb.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data || 'noop' }))) };
}

export async function sendMessage(chatId: number | string, text: string, kb?: Keyboard | null) {
  return tg('sendMessage', { chat_id: chatId, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup(kb) });
}

export async function answerCallback(id: string, text?: string) {
  try { await tg('answerCallbackQuery', { callback_query_id: id, text: text?.slice(0, 190) }); } catch { /* eskirgan tugma */ }
}

export async function editMessage(chatId: number | string, messageId: number, text: string, kb?: Keyboard | null) {
  try {
    await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup(kb) ?? { inline_keyboard: [] } });
  } catch { /* xabar o'zgarmagan yoki o'chirilgan */ }
}

/** Fayl yuborish (zaxira nusxa). */
export async function sendDocument(chatId: number | string, filename: string, content: string | Uint8Array, caption?: string) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) form.set('caption', caption.slice(0, 900));
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  form.set('document', new Blob([bytes as BlobPart]), filename);
  const res = await fetch(`${api()}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
  const j = (await res.json().catch(() => null)) as { ok: boolean; description?: string; error_code?: number } | null;
  if (!j || !j.ok) throw new TgError(j?.error_code || res.status, j?.description || 'Fayl yuborilmadi');
}

export async function setWebhook(url: string, secret: string) {
  return tg('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
}
