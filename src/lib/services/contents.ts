import { z } from 'zod';
import { db } from '../db';
import { audit } from '../audit';
import { bad, forbidden, notFound } from '../http';
import { canProject, isAdmin, stageLocked, type Me } from '../perm';
import { notifyAuthor, requestApproval } from '../notify';
import { memberIdByName, projectByName, snapshot, zDate, zStr } from './common';

export const STAGES = ["G'oya", 'Ijobiy', 'Skript Tayyor', 'Syomka Qilindi', 'TZ Berildi', 'Montaj Tayyor', 'Tasdiqlandi', 'Post Joylandi'] as const;
const POST_OPEN = ['Tasdiqlandi', 'Post Joylandi'];
const STAGE_APPROVAL = new Set(["G'oya", 'Montaj Tayyor']);
const PLATFORMS = ['instagram', 'telegram', 'youtube'] as const;
const Plat = z.array(z.enum(PLATFORMS)).transform((a) => [...new Set(a)]);
const Time = z.string().trim().regex(/^\d{2}:\d{2}$/, "Vaqt noto'g'ri").nullish().or(z.literal('')).transform((v) => (v ? v : null));

const Fields = {
  title: z.string().trim().min(1, 'Kontent nomini kiriting').max(300),
  author: zStr(100),
  editor: zStr(100),
  category: zStr(60),
  stage: z.enum(STAGES),
  hook: zStr(4000),
  mainBody: zStr(20000),
  cta: zStr(4000),
  reference: zStr(1000),
  material: zStr(1000),
  rekda: z.boolean(),
  target: z.boolean(),
  platforms: Plat,
  autoPost: z.boolean(),
  postDate: zDate,
  postTime: Time,
  postedOn: Plat,
  linkInstagram: zStr(1000),
  linkTelegram: zStr(1000),
  linkYoutube: zStr(1000),
  noteInstagram: zStr(4000),
  noteTelegram: zStr(4000),
  noteYoutube: zStr(4000)
};

const CreateBody = z.object(Fields).partial().extend({ project: z.string().trim().min(1, 'Loyihani tanlang'), title: Fields.title }).strict();
const PatchBody = z.object(Fields).partial().strict();

const POST_KEYS = ['platforms', 'autoPost', 'postDate', 'postTime', 'postedOn', 'linkInstagram', 'linkTelegram', 'linkYoutube', 'noteInstagram', 'noteTelegram', 'noteYoutube'] as const;

export async function createContent(me: Me, input: unknown) {
  const b = CreateBody.parse(input);
  const sql = db();
  const id = await sql.begin(async (tx) => {
    const p = await projectByName(tx as never, b.project);
    if (!canProject(me, p.id)) throw forbidden("Bu loyihaga kontent qo'sha olmaysiz");
    const stage = b.stage ?? "G'oya";
    if (stageLocked(me, stage)) throw forbidden('Bu bosqichni faqat Admin yoki PM belgilaydi');
    if (b.target && !isAdmin(me)) throw forbidden('Targetga yuborishni faqat Admin belgilaydi');
    if (POST_KEYS.some((k) => b[k as keyof typeof b] !== undefined) && !POST_OPEN.includes(stage)) throw bad('Joylash faqat «Tasdiqlandi» bosqichida ochiladi');
    const author = b.author ? await memberIdByName(tx as never, b.author) : me.id;
    const editor = await memberIdByName(tx as never, b.editor);
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(position), 0) + 1 as next from contents where project_id = ${p.id}`;
    const [row] = await tx`
      insert into contents (project_id, position, title, author_id, editor_id, stage, rekda, target, category, hook, main_body, cta, reference_url, material_url,
        platforms, auto_post, post_date, post_time, posted_on, link_instagram, link_telegram, link_youtube, note_instagram, note_telegram, note_youtube)
      values (${p.id}, ${next}, ${b.title}, ${author}, ${editor}, ${stage}, ${!!b.rekda}, ${!!b.target}, ${b.category ?? null}, ${b.hook ?? null}, ${b.mainBody ?? null}, ${b.cta ?? null},
        ${b.reference ?? null}, ${b.material ?? null}, ${b.platforms ?? []}, ${!!b.autoPost}, ${b.postDate ?? null}, ${b.postTime ?? null}, ${b.postedOn ?? []},
        ${b.linkInstagram ?? null}, ${b.linkTelegram ?? null}, ${b.linkYoutube ?? null}, ${b.noteInstagram ?? null}, ${b.noteTelegram ?? null}, ${b.noteYoutube ?? null})
      returning *`;
    await audit(tx as never, { actor: me, action: 'create', entity: 'content', entityId: row.id, summary: `Yangi kontent: ${p.name} — «${b.title}»`, after: snapshot(row) });
    if (!isAdmin(me) && me.position !== 'PM') await requestApproval(tx as never, row, me.id);
    return row.id as string;
  });
  return { id };
}

export async function updateContent(me: Me, id: string, input: unknown) {
  const b = PatchBody.parse(input);
  const sql = db();
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from contents where id = ${id} and archived_at is null for update`;
    if (!before) throw notFound('Kontent topilmadi');
    if (!canProject(me, before.project_id)) throw forbidden('Bu loyiha kontentini tahrirlay olmaysiz');

    let stage: string = b.stage ?? before.stage;
    if (b.stage && b.stage !== before.stage) {
      if (stageLocked(me, b.stage)) throw forbidden('Bu bosqichni faqat Admin yoki PM belgilaydi');
      if (!isAdmin(me) && POST_OPEN.includes(before.stage)) throw forbidden("Tasdiqlangan kontent bosqichini faqat Admin o'zgartiradi");
    }
    if (b.target !== undefined && b.target !== before.target && !isAdmin(me)) throw forbidden("Targetga yuborishni faqat Admin o'zgartiradi");
    const touchesPost = POST_KEYS.some((k) => b[k as keyof typeof b] !== undefined);
    if (touchesPost && !POST_OPEN.includes(stage)) throw bad('Joylash faqat «Tasdiqlandi» bosqichida ochiladi');

    // Barcha tanlangan platformalarda joylangan bo'lsa bosqich avtomatik «Post Joylandi» ga o'tadi (va teskarisi)
    const platsNow: string[] = b.platforms ?? before.platforms;
    const postedNow: string[] = b.postedOn ?? before.posted_on;
    if (b.postedOn !== undefined || b.platforms !== undefined) {
      const all = platsNow.length > 0 && platsNow.every((x) => postedNow.includes(x));
      if (all && stage === 'Tasdiqlandi') stage = 'Post Joylandi';
      else if (!all && stage === 'Post Joylandi' && b.stage === undefined) stage = 'Tasdiqlandi';
    }

    const author = b.author !== undefined ? (b.author ? await memberIdByName(tx as never, b.author) : null) : before.author_id;
    const editor = b.editor !== undefined ? await memberIdByName(tx as never, b.editor) : before.editor_id;
    const pick = <T>(v: T | undefined, old: T) => (v === undefined ? old : v);

    const [row] = await tx`
      update contents set
        title = ${b.title ?? before.title}, author_id = ${author}, editor_id = ${editor}, stage = ${stage},
        rekda = ${pick(b.rekda, before.rekda)}, target = ${pick(b.target, before.target)},
        category = ${pick(b.category, before.category)}, hook = ${pick(b.hook, before.hook)}, main_body = ${pick(b.mainBody, before.main_body)},
        cta = ${pick(b.cta, before.cta)}, reference_url = ${pick(b.reference, before.reference_url)}, material_url = ${pick(b.material, before.material_url)},
        platforms = ${pick(b.platforms, before.platforms)}, auto_post = ${pick(b.autoPost, before.auto_post)},
        post_date = ${pick(b.postDate, before.post_date)}, post_time = ${pick(b.postTime, before.post_time)}, posted_on = ${pick(b.postedOn, before.posted_on)},
        link_instagram = ${pick(b.linkInstagram, before.link_instagram)}, link_telegram = ${pick(b.linkTelegram, before.link_telegram)}, link_youtube = ${pick(b.linkYoutube, before.link_youtube)},
        note_instagram = ${pick(b.noteInstagram, before.note_instagram)}, note_telegram = ${pick(b.noteTelegram, before.note_telegram)}, note_youtube = ${pick(b.noteYoutube, before.note_youtube)},
        updated_at = now()
      where id = ${id} returning *`;

    if (before.stage !== row.stage) {
      if (STAGE_APPROVAL.has(row.stage) && !isAdmin(me) && me.position !== 'PM') await requestApproval(tx as never, row, me.id);
      if (['Tasdiqlandi', 'Ijobiy'].includes(row.stage)) await notifyAuthor(tx as never, row, `${row.stage === 'Tasdiqlandi' ? '✅ Tasdiqlandi' : '👍 Ijobiy'}: «${row.title}» (${me.name})`, me.id);
    }
    const parts: string[] = [];
    if (before.stage !== row.stage) parts.push(`bosqich: ${before.stage} → ${row.stage}`);
    if (before.rekda !== row.rekda) parts.push(row.rekda ? 'rekdaga belgilandi' : 'rekdadan olindi');
    if (before.target !== row.target) parts.push(row.target ? 'targetga yuborildi' : 'targetdan olindi');
    const bp = (before.posted_on as string[]).join(',');
    const ap = (row.posted_on as string[]).join(',');
    if (bp !== ap) parts.push(`joylandi: ${ap || '—'}`);
    await audit(tx as never, {
      actor: me, action: 'update', entity: 'content', entityId: id,
      summary: `Kontent yangilandi: «${row.title}»${parts.length ? ' (' + parts.join('; ') + ')' : ''}`,
      before: snapshot(before), after: snapshot(row)
    });
  });
  return { ok: true };
}

/** Loyiha ichidagi tartibni saqlash (sudrab o'zgartirish). */
export async function reorderContents(me: Me, input: unknown) {
  const b = z.object({ project: z.string().trim().min(1), ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(input);
  const sql = db();
  await sql.begin(async (tx) => {
    const p = await projectByName(tx as never, b.project);
    if (!canProject(me, p.id)) throw forbidden();
    const rows = await tx<{ id: string; position: number }[]>`select id, position from contents where project_id = ${p.id} and archived_at is null order by position, created_at`;
    const known = new Set(rows.map((r) => r.id));
    if (b.ids.some((i) => !known.has(i))) throw bad("Tartib ro'yxati noto'g'ri");
    // ko'rsatilgan kontentlar o'z o'rin to'plamini saqlab, yangi tartibda joylashadi (filtrda yashirinlari joyida qoladi)
    const slots = rows.filter((r) => b.ids.includes(r.id)).map((r) => r.position).sort((a, c) => a - c);
    for (let i = 0; i < b.ids.length; i++) await tx`update contents set position = ${slots[i]} where id = ${b.ids[i]}`;
    await audit(tx as never, { actor: me, action: 'update', entity: 'content', entityId: null, summary: `${p.name}: kontentlar tartibi o'zgartirildi`, quiet: true });
  });
  return { ok: true };
}
