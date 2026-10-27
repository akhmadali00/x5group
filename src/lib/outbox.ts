import { db, type Sql } from './db';
import { botEnabled, sendMessage, TgError, type Keyboard } from './telegram';

/** Xabarni navbatga qo'yadi (tranzaksiya ichida chaqiriladi, xabar o'zgarish bilan birga saqlanadi). */
export async function enqueue(sql: Sql, chatId: number | string, text: string, kb?: Keyboard | null) {
  await sql`insert into outbox (chat_id, text, buttons) values (${chatId}, ${text}, ${kb && kb.length ? sql.json(kb as never) : null})`;
}

/** A'zolarga (ID bo'yicha) xabar: faqat Telegrami tasdiqlanganlarga. */
export async function enqueueToMembers(sql: Sql, memberIds: (string | null | undefined)[], text: string, kb?: Keyboard | null, exceptId?: string | null) {
  const ids = [...new Set(memberIds.filter((x): x is string => !!x && x !== exceptId))];
  if (!ids.length) return;
  const rows = await sql<{ telegram_chat_id: string }[]>`select telegram_chat_id from members where id in ${sql(ids)} and active and telegram_status = 'approved' and telegram_chat_id is not null`;
  for (const r of rows) await enqueue(sql, r.telegram_chat_id, text, kb);
}

export async function adminChats(sql: Sql, exceptId?: string | null): Promise<string[]> {
  const rows = await sql<{ telegram_chat_id: string }[]>`
    select telegram_chat_id from members where role = 'admin' and active and telegram_status = 'approved' and telegram_chat_id is not null ${exceptId ? sql`and id <> ${exceptId}` : sql``}`;
  return rows.map((r) => r.telegram_chat_id);
}

export async function enqueueToAdmins(sql: Sql, text: string, kb?: Keyboard | null, exceptId?: string | null) {
  for (const c of await adminChats(sql, exceptId)) await enqueue(sql, c, text, kb);
}

let flushing = false;

/** Navbatdagi xabarlarni Telegramga yuboradi. Xato bo'lsa 5 martagacha qayta uriniladi. */
export async function flushOutbox(limit = 40): Promise<number> {
  if (!botEnabled() || flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    const sql = db();
    const rows = await sql<{ id: string; chat_id: string; text: string; buttons: Keyboard | null }[]>`
      select id, chat_id, text, buttons from outbox where sent_at is null and attempts < 5 order by id limit ${limit}`;
    for (const r of rows) {
      // Qatorni avval "band qilamiz" (atomik): bir vaqtda ishlayotgan boshqa nusxa bir xabarni ikki marta yubormaydi
      const claimed = await sql`update outbox set sent_at = now() where id = ${r.id} and sent_at is null returning id`;
      if (!claimed.length) continue;
      try {
        await sendMessage(r.chat_id, r.text, r.buttons);
        sent++;
      } catch (e) {
        const code = e instanceof TgError ? e.code : 0;
        // 403: foydalanuvchi botni to'xtatgan; qayta urinishning ma'nosi yo'q
        await sql`update outbox set sent_at = null, attempts = ${code === 403 ? 5 : sql`attempts + 1`}, last_error = ${String((e as Error).message).slice(0, 300)} where id = ${r.id}`;
        if (code === 429) break;
      }
    }
    // eski yuborilganlarni tozalash
    await sql`delete from outbox where sent_at < now() - interval '3 days' or (attempts >= 5 and created_at < now() - interval '3 days')`;
  } finally {
    flushing = false;
  }
  return sent;
}
