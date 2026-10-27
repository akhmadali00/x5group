import { z } from 'zod';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { startSession } from '@/lib/session';
import { audit } from '@/lib/audit';
import { ok, fail, csrfGuard, HttpError } from '@/lib/http';

const Body = z.object({
  name: z.string().trim().min(1, 'Ismni kiriting').max(80),
  email: z.string().trim().toLowerCase().email("Email noto'g'ri").max(200),
  password: z.string().min(8, "Parol kamida 8 belgidan iborat bo'lsin").max(200)
});

/** Faqat tizimda birorta ham hisob yo'q paytda ishlaydi: birinchi foydalanuvchi Admin bo'ladi. */
export async function POST(req: Request) {
  try {
    csrfGuard(req);
    const b = Body.parse(await req.json());
    const sql = db();
    const hash = await hashPassword(b.password);
    let id: string;
    try {
      const [r] = await sql<{ id: string }[]>`select public.create_first_admin(${b.name}, ${b.email}, ${hash}) as id`;
      id = r.id;
    } catch (e) {
      if (String((e as Error).message).includes('setup_done')) throw new HttpError(409, 'Tizim allaqachon sozlangan. Kirish sahifasidan kiring.');
      throw e;
    }
    await audit(sql, { actor: { id, name: b.name }, action: 'system', entity: 'setup', entityId: id, summary: 'Birinchi Admin hisobi yaratildi' });
    await startSession(id, true, req.headers.get('user-agent'));
    return ok({ state: 'ok' });
  } catch (e) {
    return fail(e);
  }
}
