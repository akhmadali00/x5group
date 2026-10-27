import { readFileSync } from 'node:fs';
const BASE = 'http://localhost:3100'; const jars = {}; const results = [];
const check = (n, c, x) => results.push([c ? 'OK  ' : 'FAIL', n, c ? '' : JSON.stringify(x)?.slice(0, 500)]);
async function call(who, method, path, body, raw = false) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie: jars[who] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) jars[who] = sc.map((c) => c.split(';')[0]).join('; ');
  if (raw) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') };
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
let r = await call('a', 'POST', '/api/auth/setup', { name: 'Sensei', email: 's@x5.uz', password: 'parol12345' }); check('setup', r.status === 200, r);
await call('a', 'POST', '/api/members', { kind: 'account', name: 'Ali', email: 'ali@x5.uz', password: 'parol12345', position: 'Kontent Maker', role: 'member', permissions: ['bosh'], projects: [] });
await call('a', 'POST', '/api/projects', { name: 'Loyiha A', pms: ['Sensei'] });
await call('a', 'POST', '/api/projects', { name: 'Loyiha B', pms: ['Sensei'] });
await call('a', 'POST', '/api/contents', { project: 'Loyiha A', title: "Birinchi «kontent», vergulli", author: 'Ali', category: 'Ta\'lim', hook: 'Salom "dunyo"' });
await call('a', 'POST', '/api/contents', { project: 'Loyiha A', title: 'Ikkinchi' });
await call('a', 'POST', '/api/contents', { project: 'Loyiha B', title: 'B ning kontenti' });

// Export
for (const f of ['csv', 'xlsx', 'pdf']) {
  r = await call('a', 'POST', '/api/export/contents', { project: 'Loyiha A', columns: ['Kontent nomi', 'Tayyorladi', 'Hook'], format: f }, true);
  check('export ' + f, r.status === 200 && r.buf.length > 100, { s: r.status, n: r.buf.length });
  if (f === 'pdf') check('pdf magic', r.buf.slice(0, 4).toString() === '%PDF', r.buf.slice(0, 10).toString());
  if (f === 'xlsx') check('xlsx zip magic', r.buf.slice(0, 2).toString() === 'PK', r.buf.slice(0, 4));
  if (f === 'csv') { const t = r.buf.toString('utf8'); check('csv content', t.includes('Birinchi') && t.includes('"Salom ""dunyo"""') && !t.includes('B ning'), t); }
}
r = await call('a', 'POST', '/api/export/contents', { project: 'Loyiha A', ids: [], columns: ['Kontent nomi'], format: 'csv' }, true);
check('export with empty ids = header only', r.buf.toString('utf8').trim().split('\n').length === 1, r.buf.toString());
// permission: Ali has no project access -> empty export
await call('b', 'POST', '/api/auth/login', { email: 'ali@x5.uz', password: 'parol12345' });
r = await call('b', 'POST', '/api/export/contents', { project: 'Loyiha A', columns: ['Kontent nomi'], format: 'csv' }, true);
check('no-access member gets no rows', r.status === 200 && r.buf.toString('utf8').trim().split('\n').length === 1, r.buf.toString());
r = await call('x', 'POST', '/api/export/contents', { project: 'Loyiha A', columns: ['Kontent nomi'], format: 'csv' }, true);
check('anonymous refused', r.status === 401, r.status);
// Template
r = await call('a', 'GET', '/api/export/template?format=xlsx', undefined, true); check('template xlsx', r.status === 200 && r.buf.slice(0, 2).toString() === 'PK', r.status);
r = await call('a', 'GET', '/api/export/template?format=csv', undefined, true); check('template csv', r.status === 200 && r.buf.toString().includes('Kontent nomi'), r.status);

// Import CSV
const csv = 'Kontent nomi;Tayyorladi;Rubrika;Bosqich;Hook\nImport 1;Ali;Tahlil;Skript Tayyor;Hook 1\n;Ali;;;\nImport 3;Yo\'qOdam;;;\nImport 4;;;Noma\'lum;\nImport 5;;;;"ko;ma"\n';
r = await call('a', 'POST', '/api/import/contents', { project: 'Loyiha B', filename: 'a.csv', data: Buffer.from(csv).toString('base64') });
check('import csv: 2 added, 3 failed', r.status === 200 && r.j.added === 2 && r.j.failed.length === 3, r);
let d = (await call('a', 'GET', '/api/data')).j;
const b = d.datasets.contents.filter((c) => c.loyiha === 'Loyiha B');
check('imported rows visible with stage/hook', b.length === 3 && b.some((c) => c.nomi === 'Import 1' && c.bosqich === 'Skript Tayyor' && c.hook === 'Hook 1' && c.tayyorladi === 'Ali') && b.some((c) => c.hook === 'ko;ma'), b);
// Import xlsx (roundtrip: export then import to other project)
r = await call('a', 'POST', '/api/export/contents', { project: 'Loyiha A', columns: ['Kontent nomi', 'Tayyorladi', 'Rubrika', 'Bosqich', 'Hook'], format: 'xlsx' }, true);
r = await call('a', 'POST', '/api/import/contents', { project: 'Loyiha B', filename: 'b.xlsx', data: r.buf.toString('base64') });
check('xlsx roundtrip imports 2', r.status === 200 && r.j.added === 2 && r.j.failed.length === 0, r);
// Errors
r = await call('a', 'POST', '/api/import/contents', { project: 'Loyiha B', filename: 'x.pdf', data: 'AAAA' }); check('wrong extension refused', r.status === 400, r);
r = await call('a', 'POST', '/api/import/contents', { project: 'Loyiha B', filename: 'x.csv', data: Buffer.from('Nomi\nA\n').toString('base64') }); check('missing title column refused', r.status === 400, r);
r = await call('b', 'POST', '/api/import/contents', { project: 'Loyiha A', filename: 'a.csv', data: Buffer.from(csv).toString('base64') }); check('no-access member import refused', r.status === 403, r);
r = await call('a', 'POST', '/api/import/contents', { project: 'Yo\'q', filename: 'a.csv', data: Buffer.from(csv).toString('base64') }); check('unknown project refused', r.status === 400, r);
for (const x of results) console.log(...x);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
