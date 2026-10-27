import { db } from '../db';
import { audit } from '../audit';
import { bad, forbidden, notFound } from '../http';
import { isAdmin, type Me } from '../perm';
import { snapshot } from './common';

const TABLE: Record<string, string> = { task: 'tasks', shoot: 'shoots', content: 'contents', project: 'projects', member: 'members' };
const SOFT: string[] = ['task', 'shoot', 'content'];
const SKIP_COLS = new Set(['id', 'created_at', 'password_hash', 'totp_secret', 'telegram_chat_id', 'telegram_status']);

export const REVERTABLE_SQL = `reverted_at is null and entity in ('task','shoot','content','project','member') and entity_id is not null and (
  (action = 'update' and before_data is not null) or (action in ('create','delete','restore') and entity in ('task','shoot','content')))`;

/** Admin tarixdagi bitta o'zgarishni bekor qiladi: qator oldingi holatiga qaytadi yoki arxivga/arxivdan o'tadi. */
export async function revertEntry(me: Me, entryId: number) {
  if (!isAdmin(me)) throw forbidden('Faqat Admin');
  const sql = db();
  await sql.begin(async (tx) => {
    const [e] = await tx`select * from audit_log where id = ${entryId} for update`;
    if (!e) throw notFound('Yozuv topilmadi');
    if (e.reverted_at) throw bad('Bu o\'zgarish allaqachon qaytarilgan');
    const table = TABLE[e.entity];
    if (!table || !e.entity_id) throw bad('Bu turdagi o\'zgarishni qaytarib bo\'lmaydi');
    const [cur] = await tx`select * from ${tx(table)} where id = ${e.entity_id} for update`;
    if (!cur) throw notFound('Yozuv endi mavjud emas');

    let row;
    if (e.action === 'update') {
      if (!e.before_data) throw bad('Oldingi holat saqlanmagan');
      const before = e.before_data as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(before)) if (!SKIP_COLS.has(k) && k in cur) patch[k] = before[k];
      const cols = Object.keys(patch);
      if (!cols.length) throw bad('Qaytariladigan maydon yo\'q');
      [row] = await tx`update ${tx(table)} set ${tx(patch, ...cols)} where id = ${e.entity_id} returning *`;
    } else if (SOFT.includes(e.entity)) {
      // create -> arxivga; delete -> qaytarish; restore -> arxivga
      const archive = e.action === 'create' || e.action === 'restore';
      [row] = await tx`update ${tx(table)} set archived_at = ${archive ? new Date() : null} where id = ${e.entity_id} returning *`;
    } else throw bad('Bu turdagi o\'zgarishni qaytarib bo\'lmaydi');

    await tx`update audit_log set reverted_at = now() where id = ${entryId}`;
    await audit(tx as never, {
      actor: me, action: 'revert', entity: e.entity, entityId: e.entity_id,
      summary: `Qaytarildi: ${e.summary}`, before: snapshot(cur), after: snapshot(row)
    });
  });
  return { ok: true };
}
