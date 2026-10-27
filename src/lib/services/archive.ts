import { db } from '../db';
import { audit } from '../audit';
import { bad, forbidden, notFound } from '../http';
import { isAdmin, type Me } from '../perm';
import { snapshot } from './common';

const TABLES = { task: 'tasks', shoot: 'shoots', content: 'contents' } as const;
export type ArchKind = keyof typeof TABLES;

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
    const label = kind === 'task' ? `vazifa «${row.title}»` : kind === 'shoot' ? `syomka (${row.place}, ${row.shoot_date})` : `kontent «${row.title}»`;
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
