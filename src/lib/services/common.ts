import { z } from 'zod';
import type { Sql } from '../db';
import { bad, notFound } from '../http';

export type Tx = Sql;

/** Bo'sh qatorni null ga aylantiradi */
export const nul = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export const zStr = (max = 500) => z.string().trim().max(max).nullish().transform((v) => nul(v));
export const zDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri")
  .nullish()
  .or(z.literal(''))
  .transform((v) => nul(v as string | null | undefined));
export const zInt = (min = 0, max = 1_000_000_000) =>
  z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message: `${min}–${max} orasida butun son bo'lsin` });
      return z.NEVER;
    }
    return n;
  });

export async function memberIdByName(sql: Tx, name: string | null | undefined): Promise<string | null> {
  const n = nul(name);
  if (!n) return null;
  const [m] = await sql<{ id: string }[]>`select id from members where lower(name) = lower(${n}) and active`;
  if (!m) throw bad(`A'zo topilmadi: ${n}`);
  return m.id;
}

export async function memberIdsByNames(sql: Tx, names: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const n of names) {
    const id = await memberIdByName(sql, n);
    if (id) out.push(id);
  }
  return [...new Set(out)];
}

export async function projectByName(sql: Tx, name: string) {
  const [p] = await sql<{ id: string; name: string }[]>`select id, name from projects where lower(name) = lower(${name.trim()}) and archived_at is null`;
  if (!p) throw notFound(`Loyiha topilmadi: ${name}`);
  return p;
}

export function snapshot<T extends Record<string, unknown>>(row: T | undefined): unknown {
  if (!row) return null;
  const { password_hash, totp_secret, ...rest } = row as Record<string, unknown>; // sirlarni audit logga yozmaymiz
  void password_hash; void totp_secret;
  return rest;
}

/** Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD) va unga kun qo'shish */
export function todayTashkent(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
