import { db } from './db';
import { HttpError } from './http';

/** Muvaffaqiyatsiz urinishlar soni oxirgi 15 daqiqada oshib ketsa, vaqtincha to'xtatamiz. */
export async function assertNotLocked(key: string, ip: string) {
  const sql = db();
  const [a] = await sql<{ n: number }[]>`
    select count(*)::int n from login_attempts where lower(email) = lower(${key}) and not ok and at > now() - interval '15 minutes'`;
  const [b] = await sql<{ n: number }[]>`
    select count(*)::int n from login_attempts where ip = ${ip} and not ok and at > now() - interval '15 minutes'`;
  if (a.n >= 5 || b.n >= 30) throw new HttpError(429, "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring.");
}

export async function recordAttempt(key: string, ip: string, ok: boolean) {
  const sql = db();
  await sql`insert into login_attempts (email, ip, ok) values (${key}, ${ip}, ${ok})`;
  if (ok) await sql`delete from login_attempts where lower(email) = lower(${key}) and not ok`;
  // eski yozuvlarni vaqti-vaqti bilan tozalash
  if (Math.random() < 0.02) await sql`delete from login_attempts where at < now() - interval '2 days'`;
}
