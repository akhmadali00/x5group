// Kontentlarni Excel/CSV/PDF ga chiqarish va fayldan ichkariga olish.
import { z } from 'zod';
import { loadDatasets } from '../data';
import { bad, forbidden } from '../http';
import { canProject, type Me } from '../perm';
import { db } from '../db';
import { createContent, STAGES } from './contents';
import { toCsv, toPdf, toXlsx, readTable, type Table } from '../files';

export const EXPORT_COLS: Record<string, (c: Record<string, unknown>) => string> = {
  'Kontent nomi': (c) => String(c.nomi ?? ''),
  Tayyorladi: (c) => String(c.tayyorladi ?? ''),
  Rubrika: (c) => String(c.rubrika ?? ''),
  Bosqich: (c) => String(c.bosqich ?? ''),
  'Joylash vaqti': (c) => [c.joylash, c.vaqt].filter(Boolean).join(' '),
  Platformalar: (c) => String(c.platformalar ?? ''),
  'Material havolasi': (c) => String(c.material ?? ''),
  Rekda: (c) => (c.rekda ? 'Ha' : "Yo'q"),
  Target: (c) => (c.target ? 'Ha' : "Yo'q"),
  Hook: (c) => String(c.hook ?? ''),
  'Main Body': (c) => String(c.mainbody ?? ''),
  CTA: (c) => String(c.cta ?? ''),
  Reference: (c) => String(c.reference ?? '')
};

export const IMPORT_HEADERS = ['Kontent nomi', 'Tayyorladi', 'Rubrika', 'Bosqich', 'Hook', 'Main Body', 'CTA', 'Reference', 'Material havolasi'];

const ExportBody = z.object({
  project: z.string().trim().min(1),
  ids: z.array(z.string()).max(5000).optional(),
  columns: z.array(z.string()).min(1).max(30),
  format: z.enum(['pdf', 'csv', 'xlsx'])
});

export async function exportContents(me: Me, input: unknown) {
  const b = ExportBody.parse(input);
  const cols = b.columns.filter((c) => c in EXPORT_COLS);
  if (!cols.length) throw bad('Kamida bitta ustunni tanlang');
  // loadDatasets ruxsatga ko'ra filtrlangan: foydalanuvchi ko'rmaydigan kontent bu yerga tushmaydi
  const { datasets } = await loadDatasets(me);
  let items = datasets.contents.filter((c) => c.loyiha === b.project);
  if (b.ids) { const s = new Set(b.ids); items = items.filter((c) => s.has(c.id)); }
  items.sort((a, c) => (a.tartib as number) - (c.tartib as number));
  const t: Table = { title: `${b.project} — kontentlar`, columns: cols, rows: items.map((c) => cols.map((k) => EXPORT_COLS[k](c))) };
  const base = b.project.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'loyiha';
  if (b.format === 'csv') return { buf: toCsv(t), mime: 'text/csv; charset=utf-8', name: `${base}-kontentlar.csv`, count: items.length };
  if (b.format === 'xlsx') return { buf: await toXlsx([t]), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `${base}-kontentlar.xlsx`, count: items.length };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  return { buf: await toPdf(t, `${items.length} ta kontent · ${day}`), mime: 'application/pdf', name: `${base}-kontentlar.pdf`, count: items.length };
}

export async function templateFile(format: string) {
  const t: Table = {
    title: 'Namuna', columns: IMPORT_HEADERS,
    rows: [['Birinchi kontent nomi', '', 'Ta\'lim', "G'oya", 'Diqqatni tortuvchi birinchi gap', 'Asosiy matn', 'Obuna bo\'ling', '', '']]
  };
  if (format === 'csv') return { buf: toCsv(t), mime: 'text/csv; charset=utf-8', name: 'kontent-namuna.csv' };
  return { buf: await toXlsx([t]), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'kontent-namuna.xlsx' };
}

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_ROWS = 500;
const ImportBody = z.object({ project: z.string().trim().min(1), filename: z.string().max(200), data: z.string().max(MAX_BYTES * 1.4) });
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export type ImportResult = { added: number; failed: { row: number; error: string }[]; total: number };

export async function importContents(me: Me, input: unknown): Promise<ImportResult> {
  const b = ImportBody.parse(input);
  const buf = Buffer.from(b.data, 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw bad('Fayl hajmi 3 MB dan oshmasligi kerak');
  if (!/\.(xlsx|csv|txt)$/i.test(b.filename)) throw bad('Faqat .xlsx yoki .csv fayl yuklang');
  // loyihaga ruxsat oldindan tekshiriladi (har bir qator ham createContent ichida qayta tekshiriladi)
  const [p] = await db()<{ id: string }[]>`select id from projects where name = ${b.project} and archived_at is null`;
  if (!p) throw bad('Loyiha topilmadi');
  if (!canProject(me, p.id)) throw forbidden("Bu loyihaga kontent qo'sha olmaysiz");

  let rows: string[][];
  try { rows = await readTable(buf, b.filename); } catch { throw bad("Faylni o'qib bo'lmadi. Namuna faylga o'xshash .xlsx yoki .csv yuklang"); }
  if (rows.length < 2) throw bad("Faylda ma'lumot qatorlari yo'q");
  if (rows.length - 1 > MAX_ROWS) throw bad(`Bir martada ko'pi bilan ${MAX_ROWS} ta qator yuklash mumkin`);
  const head = rows[0].map(norm);
  const idx = (name: string) => head.indexOf(norm(name));
  const ci = { title: idx('Kontent nomi'), author: idx('Tayyorladi'), cat: idx('Rubrika'), stage: idx('Bosqich'), hook: idx('Hook'), body: idx('Main Body'), cta: idx('CTA'), ref: idx('Reference'), mat: idx('Material havolasi') };
  if (ci.title < 0) throw bad("«Kontent nomi» ustuni topilmadi. Namuna faylni yuklab oling");
  const cell = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  const stageMap = new Map<string, string>(STAGES.map((s) => [norm(s), s]));

  const res: ImportResult = { added: 0, failed: [], total: rows.length - 1 };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = cell(r, ci.title);
    try {
      if (!title) throw bad('Kontent nomi bo\'sh');
      const stRaw = cell(r, ci.stage);
      let stage: string | undefined;
      if (stRaw) { stage = stageMap.get(norm(stRaw)); if (!stage) throw bad(`Noma'lum bosqich: «${stRaw}»`); }
      const body: Record<string, unknown> = { project: b.project, title };
      const set = (k: string, v: string) => { if (v) body[k] = v; };
      set('author', cell(r, ci.author)); set('category', cell(r, ci.cat)); set('hook', cell(r, ci.hook)); set('mainBody', cell(r, ci.body));
      set('cta', cell(r, ci.cta)); set('reference', cell(r, ci.ref)); set('material', cell(r, ci.mat));
      if (stage) body.stage = stage;
      await createContent(me, body);
      res.added++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Xato';
      res.failed.push({ row: i + 1, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? 'Xato') : msg });
    }
  }
  return res;
}
