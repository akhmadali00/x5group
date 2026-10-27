import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { newTotpSecret, totpUri } from '@/lib/crypto';
import { requireAdmin } from '@/lib/session';
import { ok, fail, csrfGuard, bad } from '@/lib/http';

/** Admin 2 bosqichli kirishni sozlashni boshlaydi: yangi sir yaratadi (hali yoqilmaydi). */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const s = await requireAdmin();
    if (s.totpEnabled) throw bad('2 bosqichli kirish allaqachon yoqilgan');
    const secret = newTotpSecret();
    await db()`update members set totp_secret = ${secret}, totp_enabled = false where id = ${s.me.id}`;
    const uri = totpUri(secret, s.email || s.me.name);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return ok({ secret, uri, qr });
  } catch (e) {
    return fail(e);
  }
}
