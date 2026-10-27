import type { Sql } from './db';
import { enqueueToAdmins } from './outbox';
import { botEnabled, esc } from './telegram';

export type Actor = { id: string; name: string } | null;

type Entry = {
  actor: Actor;
  action: 'create' | 'update' | 'delete' | 'restore' | 'revert' | 'login' | 'system';
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  quiet?: boolean; // Adminga Telegram orqali yuborilmaydi (masalan, tartib o'zgarishi)
};

/** Har bir o'zgarish shu yerga yoziladi: Admin keyin ko'radi va kerak bo'lsa qaytaradi. */
export async function audit(sql: Sql, e: Entry): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    insert into audit_log (actor_id, actor_name, action, entity, entity_id, summary, before_data, after_data)
    values (${e.actor?.id ?? null}, ${e.actor?.name ?? 'Tizim'}, ${e.action}, ${e.entity}, ${e.entityId ?? null}, ${e.summary},
            ${e.before === undefined ? null : sql.json(e.before as never)}, ${e.after === undefined ? null : sql.json(e.after as never)})
    returning id`;
  if (!e.quiet && botEnabled() && e.action !== 'login' && e.action !== 'system') {
    await enqueueToAdmins(sql, `🔔 <b>${esc(e.actor?.name ?? 'Tizim')}</b>: ${esc(e.summary)}`, null, e.actor?.id ?? null);
  }
  return Number(rows[0].id);
}
