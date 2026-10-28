// Telegram kanalga avtomatik joylash: «Tasdiqlandi» bosqichidagi, "bot o'zi joylasin" belgilangan kontentlar
// belgilangan vaqtda loyihaning Telegram kanaliga yuboriladi (bot kanalda admin bo'lishi kerak).
import type { Sql } from './db';
import { audit } from './audit';
import { enqueue, adminChats } from './outbox';
import { botEnabled, esc, tg, type Keyboard } from './telegram';
import { handleOf } from './social';
import { addDays } from './services/common';
import type { Local } from './reminders';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const MAX_LATE_MIN = 180; // 3 soatdan ko'p kechiksa, o'zi joylamaydi — Adminga/PM'ga xabar beradi
const IMG = /\.(jpe?g|png|webp)(\?|#|$)/i;
const VID = /\.(mp4|mov|m4v)(\?|#|$)/i;

export function captionOf(c: R): string {
  const own = String(c.note_telegram || '').trim();
  if (own) return own;
  return [c.hook, c.main_body, c.cta].map((x) => String(x || '').trim()).filter(Boolean).join('\n\n');
}

type TgMsg = { message_id: number };

/** Kanalga yuboradi, birinchi xabar ID'sini qaytaradi. Havola to'g'ridan-to'g'ri rasm/video bo'lsa, shu fayl bilan. */
async function postToChannel(handle: string, c: R): Promise<number> {
  const chat_id = '@' + handle;
  const text = captionOf(c);
  const material = String(c.material_url || '').trim();
  const isUrl = /^https?:\/\//i.test(material);
  if (isUrl && (IMG.test(material) || VID.test(material))) {
    const method = IMG.test(material) ? 'sendPhoto' : 'sendVideo';
    const key = IMG.test(material) ? 'photo' : 'video';
    try {
      const short = text.length <= 1024;
      const m = await tg<TgMsg>(method, { chat_id, [key]: material, ...(short && text ? { caption: text } : {}) });
      if (!short) await tg<TgMsg>('sendMessage', { chat_id, text: text.slice(0, 4096), disable_web_page_preview: true });
      return m.message_id;
    } catch (e) {
      // fayl yuklanmadi (yopiq havola va h.k.): matn + havola bilan davom etamiz
      console.error('[x5] avto-joylash media xatosi, matnga o\'tildi:', (e as Error).message);
    }
  }
  const body = [text, isUrl && !text.includes(material) ? material : ''].filter(Boolean).join('\n\n');
  if (!body) throw new Error("Joylash uchun matn (izoh) ham, material havolasi ham yo'q");
  const m = await tg<TgMsg>('sendMessage', { chat_id, text: body.slice(0, 4096), disable_web_page_preview: false });
  return m.message_id;
}

async function recipients(sql: Sql, c: R): Promise<string[]> {
  const rows = await sql<{ telegram_chat_id: string }[]>`
    select m.telegram_chat_id from members m
    where m.active and m.telegram_status = 'approved' and m.telegram_chat_id is not null
      and (m.id = ${c.author_id} or m.id in (select member_id from project_pms where project_id = ${c.project_id}))`;
  return [...new Set([...rows.map((r) => String(r.telegram_chat_id)), ...(await adminChats(sql)).map(String)])];
}

export async function autoPost(sql: Sql, t: Local): Promise<number> {
  if (!botEnabled()) return 0;
  const rows = await sql<R[]>`
    select c.*, p.name as project, p.tg_link from contents c join projects p on p.id = c.project_id
    where c.archived_at is null and p.archived_at is null and c.stage = 'Tasdiqlandi' and c.auto_post and 'telegram' = any(c.platforms) and not ('telegram' = any(c.posted_on))
      and c.post_date is not null and c.post_time is not null and c.post_date <= ${t.date}`;
  let done = 0;
  for (const c of rows) {
    const [hh, mm] = String(c.post_time).split(':').map(Number);
    const days = Math.round((Date.parse(`${t.date}T00:00:00Z`) - Date.parse(`${c.post_date}T00:00:00Z`)) / 86400000);
    const late = days * 1440 + t.minutes - (hh * 60 + mm); // musbat = vaqt o'tgan
    if (late < 0) continue;
    const kb: Keyboard = [[{ text: '✅ Telegram — qo\'lda joylandi', data: `p:${c.id}:telegram` }]];
    if (late > MAX_LATE_MIN) {
      const first = await sql`insert into reminder_log (kind, ref, chat_id) values ('autopost-late', ${c.id}, 0) on conflict do nothing returning kind`;
      if (first.length) for (const ch of await recipients(sql, c)) await enqueue(sql, ch, `⚠️ <b>Avtomatik joylanmadi</b> (vaqt o'tib ketgan)\n${esc(c.project)} — «${esc(c.title)}»\nBelgilangan vaqt: ${esc(c.post_date)} ${esc(c.post_time)}. Xavfsizlik uchun bot o'zi joylamadi; qo'lda joylab, tugmani bosing.`, kb);
      continue;
    }
    const handle = handleOf(c.tg_link, /(^|\.)t\.me$|(^|\.)telegram\.me$/);
    // band qilish: bir vaqtda ishlayotgan boshqa nusxa ikkinchi marta joylamasin
    const claim = await sql`insert into reminder_log (kind, ref, chat_id) values ('autopost', ${c.id}, 0) on conflict do nothing returning kind`;
    if (!claim.length) continue;
    try {
      if (!handle || /^(joinchat|\+)/.test(handle)) throw new Error("Loyihada ochiq Telegram kanal havolasi (t.me/nom) ko'rsatilmagan");
      const mid = await postToChannel(handle, c);
      const link = `https://t.me/${handle}/${mid}`;
      const posted = [...new Set([...(c.posted_on as string[]), 'telegram'])];
      const all = (c.platforms as string[]).every((x) => posted.includes(x));
      await sql.begin(async (tx) => {
        const [row] = await tx`update contents set posted_on = ${posted}, link_telegram = ${link}, stage = ${all ? 'Post Joylandi' : c.stage}, updated_at = now() where id = ${c.id} returning *`;
        await audit(tx as never, { actor: null, action: 'update', entity: 'content', entityId: c.id, summary: `Telegramga avtomatik joylandi: «${c.title}» (${c.project})`, before: { posted_on: c.posted_on, stage: c.stage }, after: { posted_on: row.posted_on, stage: row.stage, link_telegram: link } });
        for (const ch of await recipients(tx as never, c)) await enqueue(tx as never, ch, `✅ <b>Avtomatik joylandi</b>\n${esc(c.project)} — «${esc(c.title)}»\n${esc(link)}`);
      });
      done++;
    } catch (e) {
      await sql`delete from reminder_log where kind = 'autopost' and ref = ${c.id}`;
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from reminder_log where kind = 'autopost-fail' and ref like ${c.id + ':%'}`;
      await sql`insert into reminder_log (kind, ref, chat_id) values ('autopost-fail', ${`${c.id}:${n + 1}`}, 0) on conflict do nothing`;
      console.error('[x5] avto-joylash xatosi:', (e as Error).message);
      if (n + 1 >= 3) {
        const first = await sql`insert into reminder_log (kind, ref, chat_id) values ('autopost-alert', ${c.id}, 0) on conflict do nothing returning kind`;
        if (first.length) {
          await sql`insert into reminder_log (kind, ref, chat_id) values ('autopost', ${c.id}, 0) on conflict do nothing`; // endi urinmaydi
          for (const ch of await recipients(sql, c)) {
            await enqueue(sql, ch, `❌ <b>Avtomatik joylab bo'lmadi</b>\n${esc(c.project)} — «${esc(c.title)}»\nSabab: ${esc((e as Error).message)}\nBot kanalga <b>admin</b> qilib qo'shilganini va loyihada kanal havolasi (t.me/nom) borligini tekshiring. Hozircha qo'lda joylab, tugmani bosing.`, kb);
          }
        }
      }
    }
  }
  return done;
}

