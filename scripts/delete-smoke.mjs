// O'chirish / faolsizlantirish / loyiha arxivi sinovi: node scripts/delete-smoke.mjs [base]  (bo'sh bazada)
const BASE = process.argv[2] || 'http://localhost:3100';
const jars = {};
const results = [];
async function call(method, path, body, jar = 'a') {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie: jars[jar] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) jars[jar] = sc.map((c) => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j: j?.data ?? j };
}
const check = (name, cond, extra) => results.push([cond ? 'OK  ' : 'FAIL', name, cond ? '' : JSON.stringify(extra)]);
const data = async (jar = 'a') => (await call('GET', '/api/data', undefined, jar)).j;

let r = await call('POST', '/api/auth/setup', { name: 'Sensei', email: 'sensei@x5group.uz', password: 'parol12345' });
check('setup', r.status === 200, r);
r = await call('POST', '/api/members', { kind: 'account', name: 'Ali', email: 'ali@x5.uz', password: 'parol12345', position: 'Kontent Maker', role: 'member', permissions: ['bosh', 'vazifalar', 'vazifalar.royxat'], projects: [] });
const aliId = r.j.id;
r = await call('POST', '/api/members', { kind: 'freelance', name: 'Vali', position: 'Montajor' });
const valiId = r.j.id;
r = await call('POST', '/api/members', { kind: 'account', name: 'Admin2', email: 'a2@x5.uz', password: 'parol12345', position: 'PM', role: 'admin' });
const admin2 = r.j.id;
r = await call('POST', '/api/projects', { name: 'Loyiha A', pms: ['Sensei'], contractMonths: 3, contractStart: '2026-10-01', planTotal: 12 });
const pA = r.j.id;
r = await call('POST', '/api/projects', { name: 'Loyiha B', pms: ['Sensei'], contractMonths: 3, contractStart: '2026-10-01', planTotal: 12 });
const pB = r.j.id;
r = await call('POST', '/api/tasks', { assignee: 'Ali', title: 'Ali vazifasi 1', durationDays: 2 });
const t1 = r.j.id;
await call('POST', '/api/tasks', { assignee: 'Ali', title: 'Ali vazifasi 2', durationDays: 2 });
r = await call('POST', '/api/shoots', { project: 'Loyiha A', place: 'Studio', date: '2099-11-01', time: '10:00', operator: 'Vali', brandface: 'Ali' });
const s1 = r.j.id;
r = await call('POST', '/api/contents', { project: 'Loyiha A', title: 'Kontent A1', author: 'Ali', editor: 'Vali' });
const c1 = r.j.id;
r = await call('POST', '/api/contents', { project: 'Loyiha B', title: 'Kontent B1', author: 'Ali' });
const cB = r.j.id;

// ---- butunlay o'chirish: faqat arxivdan
r = await call('POST', '/api/archive', { kind: 'task', id: t1, forever: true });
check('forever blocked if not archived', r.status === 400, r);
await call('POST', '/api/auth/login', { email: 'ali@x5.uz', password: 'parol12345' }, 'm');
r = await call('POST', '/api/archive', { kind: 'task', id: t1 }, 'm');
check('member cannot archive', r.status === 403, r);
r = await call('POST', '/api/archive', { kind: 'task', id: t1, forever: true }, 'm');
check('member cannot delete forever', r.status === 403, r);
r = await call('POST', '/api/archive', { kind: 'task', id: t1 });
check('archive task', r.status === 200, r);
r = await call('POST', '/api/archive', { kind: 'task', id: t1, forever: true });
check('delete archived task forever', r.status === 200, r);
r = await call('POST', '/api/archive', { kind: 'task', id: t1, forever: true });
check('second delete 404', r.status === 404, r);
let d = await data();
check('task gone', !d.datasets.tasks.some((x) => x.id === t1), d.datasets.tasks);
await call('POST', '/api/archive', { kind: 'content', id: c1 });
r = await call('POST', '/api/archive', { kind: 'content', id: c1, forever: true });
check('delete archived content forever', r.status === 200, r);
await call('POST', '/api/archive', { kind: 'shoot', id: s1 });
r = await call('POST', '/api/archive', { kind: 'shoot', id: s1, forever: true });
check('delete archived shoot forever', r.status === 200, r);
d = await data();
const hist = d.datasets.audit.find((a) => /Butunlay/.test(a.mazmun));
check('audit has purge entry, not revertable', hist && !hist.qaytarsa, d.datasets.audit.slice(0, 3));

// ---- loyiha arxivi
r = await call('POST', '/api/shoots', { project: 'Loyiha B', place: 'Joy', date: '2099-11-02', time: '11:00', operator: 'Vali', brandface: 'Ali' });
const sB = r.j.id;
r = await call('POST', '/api/archive', { kind: 'project', id: pB });
check('archive project', r.status === 200, r);
d = await data();
check('project hidden from list', !d.datasets.projects.some((p) => p.nomi === 'Loyiha B' || p.loyiha === 'Loyiha B') && !d.datasets.profiles.some((p) => p.loyiha === 'Loyiha B'), d.datasets.profiles.map((p) => p.loyiha));
check('project content hidden', !d.datasets.contents.some((c) => c.id === cB), 1);
check('project shoots hidden', !d.datasets.shoots.some((x) => x.id === sB), d.datasets.shoots);
check('arch_projects has it', d.datasets.arch_projects.length === 1 && d.datasets.arch_projects[0].nomi === 'Loyiha B' && d.datasets.arch_projects[0].kontent === 1, d.datasets.arch_projects);
r = await call('POST', '/api/contents', { project: 'Loyiha B', title: 'Yangi' });
check('cannot add content to archived project', r.status === 404 || r.status === 400, r);
r = await call('POST', '/api/archive', { kind: 'project', id: pB, restore: true });
check('restore project', r.status === 200, r);
d = await data();
check('project back with content+shoot', d.datasets.profiles.some((p) => p.loyiha === 'Loyiha B') && d.datasets.contents.some((c) => c.id === cB) && d.datasets.shoots.some((x) => x.id === sB), 1);
await call('POST', '/api/archive', { kind: 'project', id: pB });
r = await call('POST', '/api/archive', { kind: 'project', id: pB, forever: true }, 'm');
check('member cannot delete project', r.status === 403, r);
r = await call('POST', '/api/archive', { kind: 'project', id: pB, forever: true });
check('delete project forever', r.status === 200, r);
d = await data();
check('project fully gone', d.datasets.arch_projects.length === 0 && !d.datasets.contents.some((c) => c.id === cB), 1);
r = await call('POST', '/api/projects', { name: 'Loyiha B', pms: ['Sensei'], contractMonths: 3, contractStart: '2026-10-01', planTotal: 5 });
check('name reusable after delete', r.status === 200, r);

// ---- a'zo: faolsizlantirish
r = await call('POST', '/api/contents', { project: 'Loyiha A', title: 'Kontent A2', author: 'Ali', editor: 'Vali' });
const cK = r.j.id;
r = await call('POST', '/api/members/' + aliId + '/active', { active: false }, 'm');
check('member cannot deactivate', r.status === 403, r);
r = await call('POST', '/api/members/' + (await (async () => (await data()).me?.id ?? 'x')()) + '/active', { active: false });
check('cannot deactivate self (bad id or self)', r.status >= 400, r);
r = await call('POST', '/api/members/not-a-uuid/active', { active: false });
check('bad id 404', r.status === 404, r);
r = await call('POST', '/api/members/' + aliId + '/active', { active: false });
check('deactivate Ali', r.status === 200 && r.j.archivedTasks === 1, r);
r = await call('GET', '/api/data', undefined, 'm');
check('Ali session killed', r.status === 401, r);
r = await call('POST', '/api/auth/login', { email: 'ali@x5.uz', password: 'parol12345' }, 'm2');
check('Ali cannot login', r.status >= 400, r);
d = await data();
check('Ali not in team', !d.datasets.team.some((m) => m.ism === 'Ali'), 1);
check('arch_members has Ali', d.datasets.arch_members.some((m) => m.ism === 'Ali'), d.datasets.arch_members);
check('Ali remaining task archived w/ name', d.archived && Object.keys(d.archived).some((k) => k.startsWith('task:')) && d.datasets.tasks.some((t) => t.kimga === 'Ali'), d.datasets.tasks);
check('content keeps author name', d.datasets.contents.some((c) => c.id === cK && c.tayyorladi === 'Ali'), d.datasets.contents);
r = await call('POST', '/api/tasks', { assignee: 'Ali', title: 'yana', durationDays: 1 });
check('cannot assign to inactive', r.status === 400 || r.status === 404, r);
r = await call('POST', '/api/members/' + aliId + '/active', { active: true });
check('reactivate Ali', r.status === 200, r);
r = await call('POST', '/api/auth/login', { email: 'ali@x5.uz', password: 'parol12345' }, 'm');
check('Ali can login again', r.status === 200, r);

// ---- a'zo: butunlay o'chirish
r = await call('DELETE', '/api/members/' + valiId, undefined, 'm');
check('member cannot delete member', r.status === 403, r);
r = await call('DELETE', '/api/members/' + valiId);
check('delete Vali (freelance)', r.status === 200, r);
d = await data();
check('Vali gone, content kept w/o editor', !d.datasets.team.some((m) => m.ism === 'Vali') && d.datasets.contents.some((c) => c.id === cK && !c.montajor), d.datasets.contents);
r = await call('DELETE', '/api/members/' + aliId);
check('delete Ali', r.status === 200 && r.j.tasks >= 1, r);
d = await data();
check('Ali tasks gone, content kept', !d.datasets.tasks.some((t) => t.kimga === 'Ali') && d.datasets.contents.some((c) => c.id === cK && !c.tayyorladi), d.datasets.tasks);
// oxirgi admin himoyasi
r = await call('POST', '/api/auth/login', { email: 'a2@x5.uz', password: 'parol12345' }, 'b');
r = await call('POST', '/api/members/' + admin2 + '/active', { active: false });
check('can deactivate 2nd admin while another exists', r.status === 200, r);
r = await call('POST', '/api/members/' + admin2 + '/active', { active: true });
check('reactivate admin2', r.status === 200, r);
r = await call('DELETE', '/api/members/' + admin2);
check('delete admin2 ok (Sensei remains)', r.status === 200, r);
d = await data();
const me = d.me?.name;
const self = d.datasets.team.find((m) => m.ism === 'Sensei');
r = await call('DELETE', '/api/members/' + self.id);
check('cannot delete self', r.status === 400, r);
r = await call('POST', '/api/members/' + self.id + '/active', { active: false });
check('cannot deactivate self/last admin', r.status === 400, r);

for (const x of results) console.log(x.join(' '));
const bad = results.filter((x) => x[0] === 'FAIL').length;
console.log(bad ? `\n${bad} ta xato` : '\nHammasi OK');
process.exit(bad ? 1 : 0);
