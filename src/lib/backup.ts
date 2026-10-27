// Zaxira nusxalar: kunlik avtomatik + qo'lda; Telegramda Adminlarga fayl sifatida yuboriladi.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { db, type Sql } from './db';
import { audit } from './audit';
import { bad, forbidden, notFound } from './http';
import { isAdmin, type Me } from './perm';
import { adminChats } from './outbox';
import { botEnabled, sendDocument } from './telegram';
import type { Local } from './reminders';

// Tiklash tartibi (bog'liqliklar bo'yicha)
export const TABLES = ['members', 'projects', 'project_pms', 'member_projects', 'project_stages', 'contents', 'tasks', 'shoots', 'campaigns', 'daily_results', 'telegram_requests', 'settings', 'audit_log'] as const;
const SECRET_COLS = ['password_hash', 'totp_secret', 'totp_enabled'] as const;

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type BackupData = Record<(typeof TABLES)[number], R[]>;

async function snapshotAll(sql: Sql): Promise<BackupData> {
  const out = {} as BackupData;
  for (const t of TABLES) out[t] = await sql<R[]>`select * from ${sql(t)}`;
  return out;
}

export async function createBackup(sql: Sql, kind: 'daily' | 'manual' | 'pre-restore', actor: { id: string; name: string } | null = null) {
  const data = await snapshotAll(sql);
  const counts = Object.fromEntries(TABLES.map((t) => [t, data[t].length]));
  const [row] = await sql<{ id: string }[]>`insert into backups (kind, row_counts, data) values (${kind}, ${sql.json(counts as never)}, ${sql.json(data as never)}) returning id`;
  await sql`delete from backups where kind = 'daily' and created_at < now() - interval '30 days' and extract(day from created_at) <> 1`;
  await sql`delete from backups where kind = 'pre-restore' and created_at < now() - interval '30 days'`;
  if (kind === 'manual') await audit(sql, { actor, action: 'system', entity: 'backup', entityId: row.id, summary: "Zaxira nusxa olindi (qo'lda)", quiet: true });
  return { id: Number(row.id), counts };
}

// ---- Fayl formati: sirlar (parol xeshlari, 2FA) faqat BACKUP_KEY bo'lsa shifrlangan holda qo'shiladi
function key() {
  const k = process.env.BACKUP_KEY;
  return k && k.length >= 16 ? scryptSync(k, 'x5group-backup', 32) : null;
}
function encryptSecrets(obj: unknown): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decryptSecrets(b64: string): Record<string, R> | null {
  const k = key();
  if (!k) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    const d = createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}

export function toFile(data: BackupData, createdAt: string) {
  const members = data.members.map((m) => { const o = { ...m }; for (const c of SECRET_COLS) delete o[c]; return o; });
  const secrets = encryptSecrets(Object.fromEntries(data.members.map((m) => [m.id, { password_hash: m.password_hash, totp_secret: m.totp_secret, totp_enabled: m.totp_enabled }])));
  return JSON.stringify({ app: 'x5group', version: 1, createdAt, secrets, data: { ...data, members } });
}

export async function dailyBackup(sql: Sql, t: Local) {
  if (t.minutes < 3 * 60 || t.minutes >= 12 * 60) return;
  const [has] = await sql<{ n: number }[]>`select count(*)::int n from backups where kind = 'daily' and (created_at at time zone 'Asia/Tashkent')::date = ${t.date}`;
  if (has.n) return;
  const { id } = await createBackup(sql, 'daily');
  if (!botEnabled()) return;
  const [b] = await sql<R[]>`select data, created_at from backups where id = ${id}`;
  const file = toFile(b.data as BackupData, new Date(b.created_at).toISOString());
  for (const c of await adminChats(sql)) {
    try { await sendDocument(c, `x5group-zaxira-${t.date}.json`, file, `💾 Kunlik zaxira nusxa (${t.date})`); } catch (e) { console.error('[x5] zaxira yuborilmadi', (e as Error).message); }
  }
}

/** Zaxirani bazaga qaytaradi. Avval joriy holatning "pre-restore" nusxasi olinadi. */
export async function restoreData(me: Me, data: BackupData, secrets: string | null, label: string) {
  if (!isAdmin(me)) throw forbidden('Faqat Admin');
  for (const t of TABLES) if (!Array.isArray((data as R)[t])) throw bad(`Zaxira fayli noto'g'ri: «${t}» yo'q`);
  if (!data.members.some((m) => m.role === 'admin')) throw bad("Zaxirada Admin yo'q");
  const sql = db();
  await createBackup(sql, 'pre-restore');
  await sql.begin(async (tx) => {
    const cur = await tx<R[]>`select id, password_hash, totp_secret, totp_enabled from members`;
    const keep = new Map(cur.map((m) => [m.id, m]));
    const dec = secrets ? decryptSecrets(secrets) : null;
    await tx.unsafe(`truncate ${[...TABLES].reverse().join(', ')}, sessions, outbox restart identity cascade`);
    for (const t of TABLES) {
      let rows = (data as R)[t] as R[];
      if (!rows.length) continue;
      if (t === 'members') rows = rows.map((m) => ({ totp_enabled: false, ...m })); // fayldan kelganda sirlar yo'q
      await tx.unsafe(`insert into ${t} select * from jsonb_populate_recordset(null::${t}, ($1::text)::jsonb)`, [JSON.stringify(rows)]);
    }
    for (const m of data.members) {
      const s = (dec && dec[m.id]) || (m.password_hash ? m : keep.get(m.id));
      if (s) await tx`update members set password_hash = ${s.password_hash ?? null}, totp_secret = ${s.totp_secret ?? null}, totp_enabled = ${!!s.totp_enabled} where id = ${m.id}`;
    }
    await tx`select setval(pg_get_serial_sequence('audit_log', 'id'), greatest((select coalesce(max(id), 1) from audit_log), 1))`;
    await tx`select setval(pg_get_serial_sequence('telegram_requests', 'id'), greatest((select coalesce(max(id), 1) from telegram_requests), 1))`;
    await audit(tx as never, { actor: { id: me.id, name: me.name }, action: 'system', entity: 'backup', entityId: null, summary: `Ma'lumotlar zaxiradan tiklandi: ${label}` });
  });
  return { ok: true };
}

export async function restoreFromBackupId(me: Me, id: number) {
  if (!isAdmin(me)) throw forbidden('Faqat Admin');
  const sql = db();
  const [b] = await sql<R[]>`select data, created_at from backups where id = ${id}`;
  if (!b) throw notFound('Zaxira topilmadi');
  return restoreData(me, b.data as BackupData, null, new Date(b.created_at).toISOString().slice(0, 16).replace('T', ' '));
}

export function parseBackupFile(text: string): { data: BackupData; secrets: string | null } {
  let j: R;
  try { j = JSON.parse(text); } catch { throw bad('Fayl JSON emas'); }
  if (!j || j.app !== 'x5group' || !j.data) throw bad('Bu x5group zaxira fayli emas');
  return { data: j.data as BackupData, secrets: typeof j.secrets === 'string' ? j.secrets : null };
}
