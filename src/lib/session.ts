import { cookies } from 'next/headers';
import { db } from './db';
import { newToken, sha256 } from './crypto';
import { unauthorized, forbidden } from './http';
import type { Me } from './perm';

export const COOKIE = 'x5_session';
const DAYS = 14;

export async function startSession(memberId: string, mfaOk: boolean, userAgent: string | null) {
  const token = newToken();
  const expires = new Date(Date.now() + DAYS * 86400_000);
  await db()`insert into sessions (token_hash, member_id, mfa_ok, expires_at, user_agent)
             values (${sha256(token)}, ${memberId}, ${mfaOk}, ${expires}, ${userAgent})`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires
  });
}

export async function endSession() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await db()`delete from sessions where token_hash = ${sha256(t)}`;
  jar.delete(COOKIE);
}

export type SessionInfo = {
  me: Me;
  tokenHash: string;
  mfaOk: boolean;
  totpEnabled: boolean;
  email: string | null;
};

type Row = {
  token_hash: string;
  mfa_ok: boolean;
  id: string;
  name: string;
  email: string | null;
  role: 'admin' | 'member';
  position: string | null;
  permissions: string[];
  telegram_chat_id: string | null;
  totp_enabled: boolean;
  project_ids: string[];
};

/** Cookie bo'yicha joriy foydalanuvchi (yo'q bo'lsa null). */
export async function currentSession(): Promise<SessionInfo | null> {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (!t) return null;
  const sql = db();
  const rows = await sql<Row[]>`
    select s.token_hash, s.mfa_ok, m.id, m.name, m.email, m.role, m.position, m.permissions, m.telegram_chat_id, m.totp_enabled,
      array(select project_id from member_projects where member_id = m.id union select project_id from project_pms where member_id = m.id) as project_ids
    from sessions s join members m on m.id = s.member_id
    where s.token_hash = ${sha256(t)} and s.expires_at > now() and m.active and m.kind = 'account'`;
  const r = rows[0];
  if (!r) return null;
  // last_seen ni kamdan-kam yangilaymiz
  void sql`update sessions set last_seen = now() where token_hash = ${r.token_hash} and last_seen < now() - interval '10 minutes'`.catch(() => {});
  const me: Me = {
    id: r.id,
    name: r.name,
    role: r.role,
    position: r.position,
    permissions: new Set(r.permissions || []),
    projectIds: new Set(r.project_ids || []),
    telegramChatId: r.telegram_chat_id ? Number(r.telegram_chat_id) : null
  };
  return { me, tokenHash: r.token_hash, mfaOk: r.mfa_ok, totpEnabled: r.totp_enabled, email: r.email };
}

/** To'liq kirgan (2 bosqich ham o'tgan) foydalanuvchi talab qilinadi. */
export async function requireMe(): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) throw unauthorized();
  if (s.me.role === 'admin' && s.totpEnabled && !s.mfaOk) throw forbidden('Avval 2 bosqichli kodni tasdiqlang');
  return s;
}

export async function requireAdmin(): Promise<SessionInfo> {
  const s = await requireMe();
  if (s.me.role !== 'admin') throw forbidden('Faqat Admin uchun');
  return s;
}

/** Bot uchun: a'zo ID bo'yicha Me (veb-sessiyasiz). Faqat akkauntli, faol a'zolar. */
export async function loadMe(memberId: string): Promise<Me | null> {
  const sql = db();
  const [r] = await sql<Omit<Row, 'token_hash' | 'mfa_ok' | 'totp_enabled'>[]>`
    select id, name, email, role, position, permissions, telegram_chat_id from members where id = ${memberId} and active and kind = 'account'`;
  if (!r) return null;
  const proj = await sql<{ project_id: string }[]>`
    select project_id from member_projects where member_id = ${r.id}
    union select project_id from project_pms where member_id = ${r.id}`;
  return {
    id: r.id, name: r.name, role: r.role, position: r.position,
    permissions: new Set(r.permissions || []),
    projectIds: new Set(proj.map((p) => p.project_id)),
    telegramChatId: r.telegram_chat_id ? Number(r.telegram_chat_id) : null
  };
}
