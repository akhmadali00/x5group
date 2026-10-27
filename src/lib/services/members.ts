import { z } from 'zod';
import { db } from '../db';
import { audit } from '../audit';
import { hashPassword } from '../crypto';
import { bad, forbidden, notFound } from '../http';
import { defaultPermissions, isAdmin, normalizePermissions, type Me } from '../perm';
import { nul, snapshot, zStr } from './common';

const POSITIONS = ['PM', 'Kontent Maker', 'Targetolog'];
const FREELANCE_ROLES = ['Videograph', 'Montajor', 'Brandface'];
const COLOR = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Rang noto'g'ri").nullish().transform((v) => nul(v));
const tgName = (v: string | null) => (v ? '@' + v.replace(/^@+/, '') : null);

export const MemberBody = z.object({
  kind: z.enum(['account', 'freelance']),
  name: z.string().trim().min(1, 'Ismni kiriting').max(80),
  email: z.string().trim().toLowerCase().email("Email noto'g'ri").max(200).nullish().or(z.literal('')).transform((v) => nul(v as string | null | undefined)),
  password: z.string().max(200).nullish().transform((v) => v || null),
  phone: zStr(40),
  telegram: zStr(80),
  color: COLOR,
  position: z.string().trim().max(60).nullish().transform((v) => nul(v)),
  role: z.enum(['admin', 'member']).default('member'),
  permissions: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([])
});

async function projectIdsByNames(tx: ReturnType<typeof db>, names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const rows = await tx<{ id: string }[]>`select id from projects where archived_at is null and lower(name) in ${tx(names.map((n) => n.toLowerCase()))}`;
  return rows.map((r) => r.id);
}

export async function createMember(me: Me, input: unknown) {
  if (!isAdmin(me)) throw forbidden("A'zoni faqat Admin qo'shadi");
  const b = MemberBody.parse(input);
  const sql = db();
  if (b.kind === 'freelance') {
    if (!b.position || !FREELANCE_ROLES.includes(b.position)) throw bad('Kasbini tanlang');
  } else {
    if (!b.email) throw bad('Emailni kiriting');
    if (!b.password || b.password.length < 8) throw bad("Boshlang'ich parol kamida 8 belgi bo'lsin");
    if (!b.position || !POSITIONS.includes(b.position)) throw bad('Lavozimni tanlang');
  }
  const hash = b.kind === 'account' ? await hashPassword(b.password!) : null;
  const perms = b.kind === 'freelance' ? [] : b.role === 'admin' ? defaultPermissions('PM') : normalizePermissions(b.permissions);
  const id = await sql.begin(async (tx) => {
    let row;
    try {
      [row] = await tx`
        insert into members (kind, name, email, role, position, phone, telegram_username, color, permissions, password_hash)
        values (${b.kind}, ${b.name}, ${b.kind === 'account' ? b.email : null}, ${b.kind === 'account' ? b.role : 'member'}, ${b.position}, ${b.phone}, ${tgName(b.telegram)}, ${b.color}, ${perms}, ${hash})
        returning *`;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') throw bad(String((e as { constraint_name?: string }).constraint_name || '').includes('email') ? 'Bu email band' : 'Bu ism band');
      throw e;
    }
    if (b.kind === 'account' && b.position === 'Kontent Maker') {
      for (const pid of await projectIdsByNames(tx as never, b.projects)) await tx`insert into member_projects (member_id, project_id) values (${row.id}, ${pid}) on conflict do nothing`;
    }
    await audit(tx as never, { actor: me, action: 'create', entity: 'member', entityId: row.id, summary: `${b.kind === 'freelance' ? 'Frilans' : "A'zo"} qo'shildi: ${b.name}`, after: snapshot(row) });
    return row.id as string;
  });
  return { id };
}

export async function updateMember(me: Me, id: string, input: unknown) {
  const self = id === me.id;
  if (!isAdmin(me) && !self) throw forbidden();
  const b = MemberBody.partial().parse(input);
  const sql = db();
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from members where id = ${id} and active for update`;
    if (!before) throw notFound("A'zo topilmadi");
    const admin = isAdmin(me);
    const name = b.name ?? before.name;
    const phone = b.phone !== undefined ? b.phone : before.phone;
    const telegram = b.telegram !== undefined ? tgName(b.telegram) : before.telegram_username;
    const color = b.color !== undefined ? b.color : before.color;
    let email = before.email, position = before.position, role = before.role, perms: string[] = before.permissions;
    let hash = before.password_hash;
    if (admin) {
      if (before.kind === 'freelance') {
        if (b.position !== undefined) {
          if (!b.position || !FREELANCE_ROLES.includes(b.position)) throw bad('Kasbini tanlang');
          position = b.position;
        }
      } else {
        if (b.email !== undefined) { if (!b.email) throw bad('Emailni kiriting'); email = b.email; }
        if (b.position !== undefined) { if (!b.position || !POSITIONS.includes(b.position)) throw bad('Lavozimni tanlang'); position = b.position; }
        if (b.role !== undefined) role = b.role;
        if (b.password) { if (b.password.length < 8) throw bad('Parol kamida 8 belgi bo\'lsin'); hash = await hashPassword(b.password); }
        if (role === 'admin') perms = defaultPermissions('PM');
        else if (b.permissions !== undefined) perms = normalizePermissions(b.permissions);
        if (before.role === 'admin' && role !== 'admin') {
          const [{ n }] = await tx<{ n: number }[]>`select count(*)::int n from members where role = 'admin' and active and id <> ${id}`;
          if (n === 0) throw bad("Oxirgi Adminni o'zgartirib bo'lmaydi");
        }
      }
    }
    let row;
    try {
      [row] = await tx`
        update members set name = ${name}, email = ${email}, role = ${role}, position = ${position}, phone = ${phone}, telegram_username = ${telegram},
          color = ${color}, permissions = ${perms}, password_hash = ${hash}
        where id = ${id} returning *`;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw bad('Bu ism yoki email band');
      throw e;
    }
    if (admin && before.kind === 'account' && b.projects !== undefined) {
      await tx`delete from member_projects where member_id = ${id}`;
      if (position === 'Kontent Maker') for (const pid of await projectIdsByNames(tx as never, b.projects)) await tx`insert into member_projects (member_id, project_id) values (${id}, ${pid}) on conflict do nothing`;
    }
    if (hash !== before.password_hash) await tx`delete from sessions where member_id = ${id}`; // parol almashgan: eski sessiyalar yopiladi
    await audit(tx as never, { actor: me, action: 'update', entity: 'member', entityId: id, summary: `${self ? 'Shaxsiy' : "A'zo"} ma'lumotlari yangilandi: ${row.name}`, before: snapshot(before), after: snapshot(row) });
  });
  return { ok: true };
}
