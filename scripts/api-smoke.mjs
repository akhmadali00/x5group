// Mahalliy API sinovi: node scripts/api-smoke.mjs [base]
const BASE = process.argv[2] || 'http://localhost:3100';
let cookie = '';
const results = [];
async function call(method, path, body, jar = 'a') {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie: jars[jar] || '' },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) jars[jar] = sc.map((c) => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
const jars = {};
function check(name, cond, extra) { results.push([cond ? 'OK  ' : 'FAIL', name, cond ? '' : JSON.stringify(extra)]); }

let r = await call('POST', '/api/auth/setup', { name: 'Sensei', email: 'sensei@x5group.uz', password: 'parol12345' });
check('setup', r.status === 200, r);
r = await call('POST', '/api/members', { kind: 'account', name: 'Ali', email: 'ali@x5.uz', password: 'parol12345', position: 'Kontent Maker', role: 'member', permissions: ['bosh','bosh.bugun','vazifalar','vazifalar.royxat'], projects: [] });
check('member create', r.status === 200, r);
r = await call('POST', '/api/members', { kind: 'freelance', name: 'Vali', position: 'Montajor' });
check('freelance create', r.status === 200, r);
r = await call('POST', '/api/projects', { name: 'Test Loyiha', pms: ['Sensei'], contractMonths: 3, contractStart: '2026-10-01', planTotal: 12 });
check('project create', r.status === 200, r);
r = await call('POST', '/api/tasks', { assignee: 'Ali', title: 'Reja tuz', durationDays: 2 });
check('task create', r.status === 200, r);
const taskId = r.j?.data?.id ?? r.j?.id;
r = await call('GET', '/api/data');
const d = r.j?.data ?? r.j;
const t = (d.datasets?.tasks || [])[0];
check('task in data w/ due', t && t.sana && t.muddat === 2, t);
r = await call('POST', '/api/shoots', { project: 'Test Loyiha', place: 'Studio', date: '2026-11-01', time: '10:00', operator: 'Vali', brandface: 'Ali' });
check('shoot create', r.status === 200, r);
r = await call('POST', '/api/contents', { project: 'Test Loyiha', title: 'Kontent 1', author: 'Ali' });
check('content create', r.status === 200, r);
const cid = r.j?.data?.id ?? r.j?.id;
r = await call('PATCH', `/api/contents/${cid}`, { stage: 'Skript Tayyor' });
check('content stage', r.status === 200, r);
r = await call('PATCH', `/api/contents/${cid}`, { platforms: ['instagram'] });
check('post fields rejected before approval', r.status === 400, r);
r = await call('PATCH', `/api/contents/${cid}`, { stage: 'Tasdiqlandi', platforms: ['instagram'], postDate: '2026-11-02', postTime: '12:00' });
check('approve + post fields (admin)', r.status === 200, r);
r = await call('PATCH', `/api/contents/${cid}`, { rekda: true, target: true });
check('flags admin', r.status === 200, r);
// member session
r = await call('POST', '/api/auth/login', { email: 'ali@x5.uz', password: 'parol12345' }, 'm');
check('member login', r.status === 200, r);
r = await call('PATCH', `/api/tasks/${taskId}`, { status: 'Jarayonda', note: 'boshladim' }, 'm');
check('assignee updates own task', r.status === 200, r);
r = await call('PATCH', `/api/tasks/${taskId}`, { title: 'Boshqa nom' }, 'm');
check('assignee cannot rename (ignored)', r.status === 200, r);
r = await call('POST', '/api/tasks', { assignee: 'Ali', title: 'x', durationDays: 1 }, 'm');
check('member cannot create task', r.status === 403, r);
r = await call('POST', '/api/shoots', { project: 'Test Loyiha', place: 'x', date: '2026-11-01', time: '10:00', operator: 'Vali', brandface: 'Ali' }, 'm');
check('member cannot create shoot', r.status === 403, r);
r = await call('POST', '/api/contents', { project: 'Test Loyiha', title: 'Kontent 2' }, 'm');
check('non-project member cannot add content', r.status === 403, r);
r = await call('POST', '/api/archive', { kind: 'task', id: taskId }, 'm');
check('member cannot archive', r.status === 403, r);
r = await call('POST', '/api/archive', { kind: 'task', id: taskId });
check('admin archives task', r.status === 200, r);
r = await call('GET', '/api/data');
const d2 = r.j?.data ?? r.j;
check('archived map', Object.keys(d2.archived || {}).some((k) => k.startsWith('task:')), d2.archived);
r = await call('POST', '/api/archive', { kind: 'task', id: taskId, restore: true });
check('admin restores task', r.status === 200, r);
r = await call('GET', '/api/data', null, 'm');
const dm = r.j?.data ?? r.j;
check('member sees own task only', (dm.datasets.tasks || []).length === 1 && (dm.datasets.profiles || []).length === 0, dm.datasets.tasks);
// ---- tarix va qaytarish
r = await call('PATCH', `/api/tasks/${taskId}`, { title: 'Yangi nom', durationDays: 5 });
check('admin edits task', r.status === 200, r);
r = await call('GET', '/api/data');
let au = (r.j?.data ?? r.j).datasets.audit;
const upd = au.find((x) => x.amal === 'update' && x.tur === 'task' && x.mazmun.includes('Yangi nom') && x.qaytarsa === 1);
check('audit has revertable entry', !!upd, au.slice(0, 3));
r = await call('POST', `/api/audit/${upd.id}`);
check('revert ok', r.status === 200, r);
r = await call('GET', '/api/data');
const t2 = (r.j?.data ?? r.j).datasets.tasks.find((x) => x.id === taskId);
check('task title restored', t2 && t2.vazifa === 'Reja tuz' && t2.muddat === 2, t2);
r = await call('POST', `/api/audit/${upd.id}`);
check('double revert refused', r.status === 400, r);
r = await call('POST', `/api/audit/${upd.id}`, null, 'm');
check('member cannot revert', r.status === 403 || r.status === 401, r);
for (const x of results) console.log(...x);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
