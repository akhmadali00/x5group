import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { isAdmin } from '@/lib/perm';
import { botEnabled, botUsername } from '@/lib/telegram';
import { ok, fail, csrfGuard, bad, forbidden } from '@/lib/http';

const Body = z.object({ memberId: z.string().uuid().optional() });

/** Telegramni ulash uchun 24 soatlik bir martalik havola. Admin istalgan a'zo uchun, a'zo o'zi uchun oladi. */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireMe();
    const b = Body.parse(await req.json().catch(() => ({})));
    const target = b.memberId || s.me.id;
    if (target !== s.me.id && !isAdmin(s.me)) throw forbidden();
    if (!botEnabled()) throw bad('Telegram bot hali sozlanmagan (TELEGRAM_BOT_TOKEN yo\'q)');
    const sql = db();
    const [m] = await sql`select id from members where id = ${target} and active`;
    if (!m) throw bad("A'zo topilmadi");
    const code = randomBytes(9).toString('base64url');
    await sql`delete from link_codes where member_id = ${target}`;
    await sql`insert into link_codes (code, member_id, expires_at) values (${code}, ${target}, now() + interval '24 hours')`;
    return ok({ url: `https://t.me/${botUsername()}?start=${code}` });
  } catch (e) {
    return fail(e);
  }
}
