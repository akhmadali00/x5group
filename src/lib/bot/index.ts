// Telegram bot: /start, Admin tasdig'i, buyruqlar va tugmalar. Barcha amallar veb-ilovadagi xizmatlar orqali o'tadi,
// shuning uchun ruxsat qoidalari bir xil (a'zo botda faqat veb-ilovada qila olganini qila oladi).
import { db, type Sql } from '../db';
import { audit } from '../audit';
import { enqueue, adminChats } from '../outbox';
import { answerCallback, editMessage, esc, sendDocument, sendMessage, type Keyboard } from '../telegram';
import { monthlyReportPdf } from '../monthlyReport';
import { loadMe } from '../session';
import { updateTask } from '../services/tasks';
import { updateContent } from '../services/contents';
import { STAGE_NEEDS_APPROVAL } from '../notify';
import { dayDigest, localParts } from '../reminders';
import { askAgent, agentEnabled } from './agent';

function prevMonth(): string {
  const t = localParts().date.split('-').map(Number);
  return new Date(Date.UTC(t[0], t[1] - 2, 1)).toISOString().slice(0, 7);
}

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HELP =
  "Buyruqlar:\n/bugun — bugungi vazifa, syomka va joylashlar\n/vazifalar — vazifalarim (tugmalar bilan holatni o'zgartirasiz)\n/syomkalar — yaqin syomkalar\n/yordam — shu xabar" +
  "\n\nOddiy matn yozsangiz, yordamchi (AI) javob beradi.";

async function memberByChat(sql: Sql, chat: number): Promise<R | null> {
  const [m] = await sql<R[]>`select * from members where telegram_chat_id = ${chat} and active`;
  return m || null;
}

export async function bindChat(sql: Sql, memberId: string, chat: number, username?: string | null) {
  await sql`update members set telegram_chat_id = null, telegram_status = 'none' where telegram_chat_id = ${chat} and id <> ${memberId}`;
  await sql`update members set telegram_chat_id = ${chat}, telegram_status = 'approved',
              telegram_username = coalesce(telegram_username, ${username ? '@' + username : null}) where id = ${memberId}`;
}

export async function handleUpdate(u: R) {
  const sql = db();
  if (u.callback_query) return onCallback(sql, u.callback_query);
  const m = u.message;
  if (!m || !m.chat || m.chat.type !== 'private' || typeof m.text !== 'string') return;
  return onMessage(sql, m);
}

async function onMessage(sql: Sql, m: R) {
  const chat: number = m.chat.id;
  const text: string = m.text.trim();
  const member = await memberByChat(sql, chat);
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, '');

  // Ulash kodi bilan: t.me/bot?start=KOD
  if (cmd === '/start' && rest[0]) {
    const [lc] = await sql<R[]>`select * from link_codes where code = ${rest[0]} and expires_at > now()`;
    if (lc) {
      await bindChat(sql, lc.member_id, chat, m.from?.username);
      await sql`delete from link_codes where code = ${rest[0]}`;
      const [mm] = await sql<R[]>`select name from members where id = ${lc.member_id}`;
      await audit(sql, { actor: { id: lc.member_id, name: mm.name }, action: 'update', entity: 'telegram', entityId: lc.member_id, summary: `Telegram ulandi: ${mm.name}`, quiet: true });
      await sendMessage(chat, `✅ Ulandi, ${esc(mm.name)}!\n\n${HELP}`);
      return;
    }
    await sendMessage(chat, "Bu havola eskirgan yoki noto'g'ri. Platformada «Telegramni ulash» orqali yangisini oling.");
    return;
  }

  if (!member) {
    if (cmd === '/start') return requestAccess(sql, m);
    await sendMessage(chat, 'Avval /start bosing — Admin tasdiqlagach ishlay boshlaysiz.');
    return;
  }
  if (member.telegram_status === 'blocked') return;

  if (cmd === '/start' || cmd === '/yordam' || cmd === '/help') {
    await sendMessage(chat, `Salom, ${esc(member.name)}!\n\n${HELP}${member.role === 'admin' ? '\n/sorovlar — kutilayotgan ulanish so\'rovlari\n/hisobot — oylik PDF hisobot (masalan: /hisobot 2026-10)' : ''}`);
    return;
  }
  if (cmd === '/sorovlar' && member.role === 'admin') return listRequests(sql, chat);
  if (cmd === '/hisobot' && member.role === 'admin') {
    const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(rest[0] || '') ? rest[0] : prevMonth();
    try {
      const r = await monthlyReportPdf(sql, m);
      await sendDocument(chat, r.name, new Uint8Array(r.buf), r.summary.replace(/<[^>]+>/g, ''));
    } catch (e) { console.error('[x5] hisobot', e); await sendMessage(chat, 'Hisobotni tayyorlab bo\'lmadi. Keyinroq urinib ko\'ring.'); }
    return;
  }

  if (member.kind !== 'account') {
    if (cmd === '/syomkalar') return sendShoots(sql, chat, member);
    await sendMessage(chat, "Sizga syomka va eslatmalar yuboriladi. Buyruqlar: /syomkalar");
    return;
  }
  if (cmd === '/bugun') {
    const d = await dayDigest(sql, { id: member.id, name: member.name, role: member.role, position: member.position, chat: String(chat) }, localParts().date, '📅 <b>Bugun</b>');
    await sendMessage(chat, d || 'Bugun uchun hech narsa yo\'q 🎉');
    return;
  }
  if (cmd === '/vazifalar') return sendTasks(sql, chat, member);
  if (cmd === '/syomkalar') return sendShoots(sql, chat, member);

  if (cmd.startsWith('/')) { await sendMessage(chat, `Tushunmadim.\n\n${HELP}`); return; }
  if (!agentEnabled()) { await sendMessage(chat, `Hozircha faqat buyruqlar ishlaydi.\n\n${HELP}`); return; }
  const me = await loadMe(member.id);
  if (!me) return;
  await sendMessage(chat, await askAgent(me, text, chat));
}

// ---------- ulanish so'rovi ----------
async function requestAccess(sql: Sql, m: R) {
  const chat: number = m.chat.id;
  const username: string | null = m.from?.username ? '@' + m.from.username : null;
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || username || String(chat);
  const [pending] = await sql<R[]>`select id from telegram_requests where chat_id = ${chat} and status = 'pending'`;
  if (pending) { await sendMessage(chat, "So'rovingiz yuborilgan. Admin tasdiqlashini kuting."); return; }
  const [req] = await sql<R[]>`insert into telegram_requests (chat_id, tg_username, tg_name) values (${chat}, ${username}, ${name}) returning id`;
  const admins = await adminChats(sql);
  if (!admins.length) {
    await sendMessage(chat, "So'rov qabul qilindi, lekin Admin hali botga ulanmagan. Admin platformada «Mening sahifam → Telegramni ulash» ni bosishi kerak.");
    return;
  }
  await sendMessage(chat, "So'rov Adminga yuborildi. Tasdiqlangach xabar olasiz.");
  const text = `🆕 <b>Botga ulanish so'rovi</b>\n${esc(name)}${username ? ' ' + esc(username) : ''}\n\nQaysi a'zo bu?`;
  const kb = await candidateKeyboard(sql, req.id, username);
  for (const c of admins) await enqueue(sql, c, text, kb);
}

async function candidateKeyboard(sql: Sql, reqId: number | string, username: string | null): Promise<Keyboard> {
  const rows = await sql<R[]>`select id, name, position, telegram_username from members where active and telegram_chat_id is null order by (lower(telegram_username) = lower(${username ?? ''})) desc, name limit 12`;
  const kb: Keyboard = [];
  for (let i = 0; i < rows.length; i += 2) kb.push(rows.slice(i, i + 2).map((r) => ({ text: r.name + (r.position ? ` (${r.position})` : ''), data: `r:${reqId}:${r.id}` })));
  kb.push([{ text: '🚫 Rad etish', data: `r:${reqId}:x` }]);
  return kb;
}

async function listRequests(sql: Sql, chat: number) {
  const rows = await sql<R[]>`select * from telegram_requests where status = 'pending' order by id limit 10`;
  if (!rows.length) { await sendMessage(chat, "Kutilayotgan so'rov yo'q."); return; }
  for (const r of rows) await sendMessage(chat, `🆕 ${esc(r.tg_name)} ${esc(r.tg_username || '')}\nQaysi a'zo bu?`, await candidateKeyboard(sql, r.id, r.tg_username));
}

// ---------- vazifalar, syomkalar ----------
async function sendTasks(sql: Sql, chat: number, member: R) {
  const tasks = await sql<R[]>`select * from tasks where assignee_id = ${member.id} and archived_at is null and status in ('Boshlanmagan','Jarayonda') order by due_on limit 10`;
  if (!tasks.length) { await sendMessage(chat, "Ochiq vazifa yo'q 🎉"); return; }
  const today = localParts().date;
  for (const t of tasks) {
    const late = t.due_on < today;
    await sendMessage(chat, taskText(t, late), taskKb(t));
  }
}
const dm = (iso: string) => { const [, m, d] = String(iso).split('-'); return `${d}.${m}`; };
const taskText = (t: R, late: boolean) => `📝 <b>${esc(t.title)}</b>\nTopshirish: ${dm(t.due_on)}${late ? ' ⚠️ kechikkan' : ''}\nHolat: ${esc(t.status)}${t.note ? `\n${esc(t.note)}` : ''}`;
const taskKb = (t: R): Keyboard => [[{ text: '▶️ Jarayonda', data: `t:${t.id}:p` }, { text: '✅ Tayyor', data: `t:${t.id}:d` }]];

async function sendShoots(sql: Sql, chat: number, member: R) {
  const date = localParts().date;
  const rows = await sql<R[]>`
    select s.*, p.name as project from shoots s join projects p on p.id = s.project_id
    where s.archived_at is null and s.status = 'Rejada' and s.shoot_date >= ${date}
      ${member.role === 'admin' ? sql`` : sql`and (s.operator_id = ${member.id} or s.brandface_id = ${member.id} or s.project_id in (select project_id from project_pms where member_id = ${member.id}))`}
    order by s.shoot_date, s.shoot_time limit 10`;
  if (!rows.length) { await sendMessage(chat, "Yaqin syomka yo'q."); return; }
  await sendMessage(chat, '🎬 <b>Yaqin syomkalar</b>\n' + rows.map((s) => `• ${dm(s.shoot_date)} ${esc(s.shoot_time)} — ${esc(s.project)}, ${esc(s.place)}`).join('\n'));
}

// ---------- tugmalar ----------
const TASK_STATUS: Record<string, string> = { p: 'Jarayonda', d: 'Tayyor' };

async function onCallback(sql: Sql, q: R) {
  const chat: number | undefined = q.message?.chat?.id;
  const mid: number | undefined = q.message?.message_id;
  const data: string = q.data || '';
  if (!chat) return answerCallback(q.id);
  const member = await memberByChat(sql, chat);
  if (!member || member.telegram_status === 'blocked') return answerCallback(q.id, "Ruxsat yo'q");
  const [kind, id, arg] = data.split(':');
  const done = async (note: string, newText?: string) => {
    await answerCallback(q.id, note);
    if (newText && mid) await editMessage(chat, mid, newText);
  };
  try {
    if (kind === 'r') return await onApprove(sql, q, member, chat, mid, id, arg);
    const me = await loadMe(member.id);
    if (!me) return await done("Bu amal faqat akkauntli a'zolar uchun");
    const orig: string = q.message?.text || '';

    if (kind === 't' && TASK_STATUS[arg]) {
      await updateTask(me, id, { status: TASK_STATUS[arg] });
      const [t] = await sql<R[]>`select * from tasks where id = ${id}`;
      const open = t.status === 'Jarayonda';
      if (mid) await editMessage(chat, mid, taskText(t, false) + (open ? '' : '\n\n✅ Bajarildi'), open ? taskKb(t) : null);
      return await answerCallback(q.id, `Holat: ${t.status}`);
    }
    if (kind === 'p') {
      const [c] = await sql<R[]>`select posted_on from contents where id = ${id} and archived_at is null`;
      if (!c) return await done('Kontent topilmadi');
      const posted = [...new Set([...(c.posted_on as string[]), arg])];
      await updateContent(me, id, { postedOn: posted });
      return await done('✅ Belgilandi', `${esc(orig)}\n\n✅ ${esc(arg)} — joylandi`);
    }
    if (kind === 'c') {
      const [c] = await sql<R[]>`select * from contents where id = ${id} and archived_at is null`;
      if (!c) return await done('Kontent topilmadi');
      const a = STAGE_NEEDS_APPROVAL[c.stage];
      if (!a) return await done('Allaqachon hal qilingan', `${esc(orig)}\n\n(allaqachon hal qilingan)`);
      if (arg === 'y') {
        await updateContent(me, id, { stage: a.to });
        return await done('Tasdiqlandi', `${esc(orig)}\n\n✅ ${esc(a.to)} (${esc(me.name)})`);
      }
      if (c.author_id) {
        const [au] = await sql<R[]>`select telegram_chat_id from members where id = ${c.author_id} and telegram_status = 'approved'`;
        if (au?.telegram_chat_id) await enqueue(sql, au.telegram_chat_id, `↩️ «${esc(c.title)}» qayta ko'rib chiqilsin (${esc(me.name)})`);
      }
      return await done("Muallifga xabar yuborildi", `${esc(orig)}\n\n↩️ Qayta ko'rish so'raldi (${esc(me.name)})`);
    }
    await done('');
  } catch (e) {
    await answerCallback(q.id, String((e as Error).message || 'Xatolik').slice(0, 180));
  }
}

async function onApprove(sql: Sql, q: R, admin: R, chat: number, mid: number | undefined, reqId: string, target: string) {
  if (admin.role !== 'admin') return answerCallback(q.id, 'Faqat Admin');
  const [req] = await sql<R[]>`select * from telegram_requests where id = ${reqId}`;
  if (!req || req.status !== 'pending') { if (mid) await editMessage(chat, mid, `${esc(q.message?.text || '')}\n\n(allaqachon hal qilingan)`); return answerCallback(q.id, 'Allaqachon hal qilingan'); }
  if (target === 'x') {
    await sql`update telegram_requests set status = 'rejected', decided_at = now() where id = ${reqId}`;
    await sendMessage(req.chat_id, "So'rovingiz rad etildi.").catch(() => {});
    if (mid) await editMessage(chat, mid, `${esc(req.tg_name)} — 🚫 rad etildi`);
    return answerCallback(q.id, 'Rad etildi');
  }
  const [mm] = await sql<R[]>`select id, name from members where id = ${target} and active`;
  if (!mm) return answerCallback(q.id, "A'zo topilmadi");
  await bindChat(sql, mm.id, Number(req.chat_id), req.tg_username ? String(req.tg_username).replace(/^@/, '') : null);
  await sql`update telegram_requests set status = 'approved', member_id = ${mm.id}, decided_at = now() where id = ${reqId}`;
  await audit(sql, { actor: { id: admin.id, name: admin.name }, action: 'update', entity: 'telegram', entityId: mm.id, summary: `Telegram tasdiqlandi: ${mm.name}`, quiet: true });
  await sendMessage(req.chat_id, `✅ Tasdiqlandi! Siz ${esc(mm.name)} sifatida ulandingiz.\n\n${HELP}`).catch(() => {});
  if (mid) await editMessage(chat, mid, `${esc(req.tg_name)} — ✅ ${esc(mm.name)} sifatida ulandi`);
  return answerCallback(q.id, 'Ulandi');
}
