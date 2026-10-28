import { db } from '../db';
import { audit } from '../audit';
import { bad, forbidden, notFound } from '../http';
import { isAdmin, type Me } from '../perm';
import { snapshot } from './common';

const TABLES = { task: 'tasks', shoot: 'shoots', content: 'contents', project: 'projects' } as const;
export type ArchKind = keyof typeof TABLES;

function labelOf(kind: ArchKind, row: Record<string, unknown>): string {
  return kind === 'task' ? `vazifa «${row.title}»` : kind === 'shoot' ? `syomka (${row.place}, ${row.shoot_date})` : kind === 'project' ? `loyiha «${row.name}»` : `kontent «${row.title}»`;
}

/** O'chirish o'rniga arxivga yuboriladi; faqat Admin, keyin qaytarish mumkin. */
export async function archiveItem(me: Me, kind: string, id: string, restore: boolean) {
  if (!isAdmin(me)) throw forbidden('Arxivni faqat Admin boshqaradi');
  if (!(kind in TABLES)) throw bad("Noma'lum tur");
  const table = TABLES[kind as ArchKind];
  const sql = db();
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from ${tx(table)} where id = ${id} for update`;
    if (!before) throw notFound('Topilmadi');
    const [row] = await tx`update ${tx(table)} set archived_at = ${restore ? null : new Date()} where id = ${id} returning *`;
    const label = labelOf(kind as ArchKind, row);
    await audit(tx as never, {
      actor: me,
      action: restore ? 'restore' : 'delete',
      entity: kind,
      entityId: id,
      summary: restore ? `Arxivdan qaytarildi: ${label}` : `Arxivga yuborildi: ${label}`,
      before: snapshot(before),
      after: snapshot(row)
    });
  });
  return { ok: true };
}

/**
 * Arxivdagi yozuvni BUTUNLAY o'chirish: faqat Admin, faqat avval arxivga yuborilgan yozuv, qaytarib bo'lmaydi
 * (faqat zaxira nusxadan tiklanadi). Loyiha o'chirilsa uning kontentlari, syomkalari, kampaniyalari va natijalari ham o'chadi.
 */
export async function deleteForever(me: Me, kind: string, id: string) {
  if (!isAdmin(me)) throw forbidden("Butunlay o'chirishni faqat Admin bajaradi");
  if (!(kind in TABLES)) throw bad("Noma'lum tur");
  const table = TABLES[kind as ArchKind];
  const sql = db();
  return sql.begin(async (tx) => {
    const [before] = await tx`select * from ${tx(table)} where id = ${id} for update`;
    if (!before) throw notFound('Topilmadi');
    if (!before.archived_at) throw bad("Avval arxivga yuboring, keyin butunlay o'chirish mumkin");
    let extra = '';
    if (kind === 'project') {
      const [c] = await tx<{ contents: number; shoots: number; campaigns: number }[]>`
        select (select count(*) from contents where project_id = ${id})::int as contents,
               (select count(*) from shoots where project_id = ${id})::int as shoots,
               (select count(*) from campaigns where project_id = ${id})::int as campaigns`;
      extra = ` (bilan birga ${c.contents} kontent, ${c.shoots} syomka, ${c.campaigns} kampaniya o'chdi)`;
    }
    await tx`delete from ${tx(table)} where id = ${id}`;
    await audit(tx as never, {
      actor: me, action: 'delete', entity: kind, entityId: null, // entityId yo'q: bu yozuvni qaytarib bo'lmaydi
      summary: `Butunlay o'chirildi: ${labelOf(kind as ArchKind, before)}${extra}`,
      before: snapshot(before)
    });
    return { ok: true };
  });
}
