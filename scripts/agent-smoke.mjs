const BASE = 'http://localhost:3100', TG = 'http://127.0.0.1:54400';
const jars = {}; const results = [];
const check = (n, c, x) => results.push([c ? 'OK  ' : 'FAIL', n, c ? '' : JSON.stringify(x)?.slice(0, 500)]);
async function call(method, path, body, jar = 'a') {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie: jars[jar] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) jars[jar] = sc.map((c) => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const hook = (u) => fetch(BASE + '/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'whsecret-test' }, body: JSON.stringify(u) });
const msg = (chat, text) => ({ message: { chat: { id: chat, type: 'private' }, from: { username: 'u' + chat, first_name: 'U' }, text } });
const tglog = async () => (await fetch(TG + '/_log?clear=1')).json();
const to = (log, chat) => log.filter((x) => x.method === 'sendMessage' && String(x.body.chat_id) === String(chat));
await tglog();
await call('POST', '/api/auth/setup', { name: 'Sensei', email: 's@x5.uz', password: 'parol12345' });
await call('POST', '/api/members', { kind: 'account', name: 'Ali', email: 'ali@x5.uz', password: 'parol12345', position: 'Kontent Maker', role: 'member', permissions: ['bosh', 'vazifalar', 'vazifalar.royxat'], projects: [] });
const d = (await call('GET', '/api/data')).j; const ali = d.datasets.team.find((x) => x.ism === 'Ali');
await call('POST', '/api/tasks', { assignee: 'Sensei', title: 'Adminning vazifasi', durationDays: 3 });
await call('POST', '/api/tasks', { assignee: 'Ali', title: 'Alining vazifasi', durationDays: 3 });
let r = await call('POST', '/api/telegram/link', { memberId: ali.id }); await hook(msg(2002, '/start ' + r.j.url.split('start=')[1]));
await new Promise((s) => setTimeout(s, 400)); await tglog();
await hook(msg(2002, 'mening vazifalarim qanday?')); await new Promise((s) => setTimeout(s, 900));
let log = await tglog(); const a = to(log, 2002)[0]?.body.text || '';
check('agent lists tasks', /NATIJA/.test(a) && a.includes('Alining') , a);
check('agent does not leak admin task', !a.includes('Adminning'), a);
await hook(msg(2002, 'yarat vazifa')); await new Promise((s) => setTimeout(s, 900));
log = await tglog(); const b2 = to(log, 2002)[0]?.body.text || '';
check('member cannot create task via agent', /XATO/.test(b2) && /ruxsat|Admin/i.test(b2), b2);
const d2 = (await call('GET', '/api/data')).j; check('no AI task created', !d2.datasets.tasks.some((x) => x.vazifa === 'AI vazifa'), d2.datasets.tasks);
// admin
r = await call('POST', '/api/telegram/link', {}); await hook(msg(2001, '/start ' + r.j.url.split('start=')[1])); await new Promise((s) => setTimeout(s, 400)); await tglog();
await hook(msg(2001, 'yarat vazifa')); await new Promise((s) => setTimeout(s, 1000));
log = await tglog(); const a3 = to(log, 2001)[0]?.body.text || '';
const d3 = (await call('GET', '/api/data')).j; check('admin can create via agent', d3.datasets.tasks.some((x) => x.vazifa === 'AI vazifa'), { a3 });
for (const x of results) console.log(...x);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
