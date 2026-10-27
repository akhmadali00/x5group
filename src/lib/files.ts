// Fayllar: CSV, Excel (xlsx), PDF yaratish va Excel/CSV ni o'qish.
import path from 'node:path';
import PDFDocument from 'pdfkit';
import writeXlsxFile from 'write-excel-file/node';
import { readSheet } from 'read-excel-file/node';

export type Table = { title: string; columns: string[]; rows: string[][] };

export function toCsv(t: Table): Buffer {
  const q = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [t.columns, ...t.rows].map((r) => r.map((c) => q(String(c ?? ''))).join(','));
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

export async function toXlsx(sheets: Table[]): Promise<Buffer> {
  const data = sheets.map((t) => ({
    sheet: t.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet',
    data: [t.columns.map((c) => ({ value: c, fontWeight: 'bold' as const })), ...t.rows.map((r) => r.map((c) => ({ value: String(c ?? '') })))],
    columns: t.columns.map((c, i) => ({ width: Math.min(60, Math.max(12, c.length + 4, ...t.rows.slice(0, 50).map((r) => String(r[i] ?? '').length + 2))) }))
  }));
  const out = await (writeXlsxFile as unknown as (d: unknown) => { toBuffer(): Promise<Buffer> })(data).toBuffer();
  return Buffer.from(out);
}

const FONT = () => path.join(process.cwd(), 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_B = () => path.join(process.cwd(), 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

/** Oddiy jadvalli PDF (A4, gorizontal). Kirill va lotin harflari uchun DejaVu shrifti. */
export function toPdf(t: Table, subtitle = ''): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, info: { Title: t.title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('r', FONT());
    doc.registerFont('b', FONT_B());
    const W = doc.page.width - 72;
    const n = Math.max(1, t.columns.length);
    // ustun kengligi: matn uzunligiga qarab, lekin kamida 8%
    const weights = t.columns.map((c, i) => Math.max(c.length, ...t.rows.slice(0, 80).map((r) => Math.min(40, String(r[i] ?? '').length)), 6));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => Math.max(W * 0.06, (w / total) * W));
    const scale = W / widths.reduce((a, b) => a + b, 0);
    const cw = widths.map((w) => w * scale);
    const drawHeader = () => {
      doc.font('b').fontSize(8);
      const y = doc.y;
      let x = 36;
      t.columns.forEach((c, i) => { doc.text(c, x + 2, y, { width: cw[i] - 4 }); x += cw[i]; });
      const h = Math.max(...t.columns.map((c, i) => doc.heightOfString(c, { width: cw[i] - 4 })));
      doc.moveTo(36, y + h + 2).lineTo(36 + W, y + h + 2).strokeColor('#999').lineWidth(0.5).stroke();
      doc.y = y + h + 5;
    };
    doc.font('b').fontSize(15).text(t.title);
    if (subtitle) doc.font('r').fontSize(9).fillColor('#666').text(subtitle).fillColor('#000');
    doc.moveDown(0.6);
    drawHeader();
    doc.font('r').fontSize(8);
    for (const r of t.rows) {
      const h = Math.max(...r.map((c, i) => doc.heightOfString(String(c ?? ''), { width: cw[i] - 4 })), 10);
      if (doc.y + h > doc.page.height - 40) { doc.addPage(); drawHeader(); doc.font('r').fontSize(8); }
      const y = doc.y;
      let x = 36;
      r.forEach((c, i) => { doc.text(String(c ?? ''), x + 2, y, { width: cw[i] - 4 }); x += cw[i]; });
      doc.y = y + h + 3;
      doc.moveTo(36, doc.y - 1).lineTo(36 + W, doc.y - 1).strokeColor('#eee').lineWidth(0.4).stroke();
    }
    doc.end();
  });
}

/** Yuklangan fayl (xlsx yoki csv) -> qatorlar (birinchi qator sarlavha). */
export async function readTable(buf: Buffer, name: string): Promise<string[][]> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = buf.toString('utf8').replace(/^﻿/, '');
    const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows: string[][] = [];
    let row: string[] = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  const rows = (await readSheet(buf)) as unknown[][];
  return rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)))).filter((r) => r.some((c) => c.trim() !== ''));
}
