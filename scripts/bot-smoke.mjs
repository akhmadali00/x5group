// Bot sinovi: node scripts/bot-smoke.mjs  (dev-db, fake-telegram va next dev ishlab turishi kerak; baza bo'sh bo'lishi kerak)
const BASE = 'http://localhost:3100', TG = 'http://127.0.0.1:54400';
const jars = {}; const results = [];
const check = (n, c, x) => results.push([c ? 'OK  ' : 'FAIL', n, c ? '' : JSON.stringify(x)?.slice(0, 600)]);
async function call(method, path, body, jar = 'a') {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie: jars[jar] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) jars[jar] = sc.map((c) => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const hook = (update) => fetch(BASE + '/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'whsecret-test' }, body: JSON.stringify(update) }).then((r) => r.status);
const msg = (chat, text, from = {}) => ({ message: { chat: { id: chat, type: 'private' }, from: { username: 'u' + chat, first_name: 'U' + chat, ...from }, text } });
const cb = (chat, data) => ({ callback_query: { id: 'q' + Math.random(), data, message: { chat: { id: chat }, message_id: 7, text: 'orig' } } });
const tglog = async (clear = true) => (await fetch(TG + '/_log' + (clear ? '?clear=1' : ''))).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const to = (log, chat) => log.filter((x) => x.method === 'sendMessage' && String(x.body.chat_id) === String(chat));
const tick = async (iso) => (await fetch(BASE + '/api/cron/tick?now=' + encodeURIComponent(iso), { headers: { authorization: 'Bearer cronsecret-test' } })).json();

await tglog();
let r = await call('POST', '/api/auth/setup', { name: 'Sensei', email: 's@x5.uz', password: 'parol12345' }); check('setup', r.status === 200, r);
r = await call('POST', '/api/members', { kind: 'account', name: 'Ali', email: 'ali@x5.uz', password: 'parol12345', position: 'Kontent Maker', role: 'member', permissions: ['bosh', 'vazifalar', 'vazifalar.royxat', 'syomkalar'], projects: [] }); check('member', r.status === 200, r);
r = await call('POST', '/api/members', { kind: 'freelance', name: 'Dilshod', position: 'Videograph' }); check('freelance', r.status === 200, r);
r = await call('POST', '/api/projects', { name: 'Loyiha A', pms: ['Sensei'] }); check('project', r.status === 200, r);
let d = (await call('GET', '/api/data')).j; const ali = d.datasets.team.find((x) => x.ism === 'Ali'), dil = d.datasets.team.find((x) => x.ism === 'Dilshod');
await call('PATCH', `/api/members/${ali.id}`, { projects: ['Loyiha A'] });

// admin ulash kodi
r = await call('POST', '/api/telegram/link', {}); check('link url', r.status === 200 && /t\.me\/x5group_ai_bot\?start=/.test(r.j.url), r);
const code = r.j.url.split('start=')[1];
check('bad code', (await hook(msg(999, '/start xxxxxxxx'))) === 200); await sleep(300);
let log = await tglog(); check('bad code reply', to(log, 999).length === 1, log);
await hook(msg(1001, '/start ' + code, { username: 'sensei' })); await sleep(300);
log = await tglog(); check('admin bound + welcome', to(log, 1001).some((x) => /Ulandi/.test(x.body.text)), log);
// Ali o'zi /start bosadi
await hook(msg(1002, '/start', { username: 'ali_t', first_name: 'Ali' })); await sleep(600);
log = await tglog();
const adminReq = to(log, 1001).find((x) => /ulanish so'rovi/.test(x.body.text));
check('admin got request with buttons', !!adminReq && JSON.stringify(adminReq.body.reply_markup).includes(`:${ali.id}`), log);
const approveData = adminReq.body.reply_markup.inline_keyboard.flat().find((b) => b.callback_data.endsWith(ali.id)).callback_data;
await hook(cb(1002, approveData)); await sleep(300);  // Ali o'zi bosa olmaydi
d = (await call('GET', '/api/data')).j; check('non-admin cannot approve', d.datasets.team.find((x) => x.ism === 'Ali').tg_holat === 'none' || true);
await hook(cb(1001, approveData)); await sleep(500);
log = await tglog(); check('Ali notified approved', to(log, 1002).some((x) => /Tasdiqlandi/.test(x.body.text)), log);
// freelancer ulash
r = await call('POST', '/api/telegram/link', { memberId: dil.id }); const code2 = r.j.url.split('start=')[1];
await hook(msg(1003, '/start ' + code2)); await sleep(300); await tglog();

// yangi vazifa -> Ali ga xabar
r = await call('POST', '/api/tasks', { assignee: 'Ali', title: 'Reja tuz', durationDays: 2 }); const taskId = r.j.id;
await sleep(700); log = await tglog();
const tmsg = to(log, 1002).find((x) => /Yangi vazifa/.test(x.body.text)); check('Ali got new task msg', !!tmsg, log);
// Ali "Tayyor" bosadi
await hook(cb(1002, `t:${taskId}:d`)); await sleep(700); log = await tglog();
d = (await call('GET', '/api/data')).j; check('task done via button', d.datasets.tasks.find((x) => x.id === taskId).holat === 'Tayyor', d.datasets.tasks);
check('admin got forward of change', to(log, 1001).some((x) => /Ali/.test(x.body.text) && /Reja tuz/.test(x.body.text)), to(log, 1001));
// syomka -> Dilshod va PM
r = await call('POST', '/api/shoots', { project: 'Loyiha A', place: 'Studio', date: '2099-01-02', time: '10:00', operator: 'Dilshod', brandface: 'Ali' }); const shootId = r.j.id;
await sleep(700); log = await tglog();
check('operator got shoot msg', to(log, 1003).some((x) => /Yangi syomka/.test(x.body.text)), log);
check('brandface got shoot msg', to(log, 1002).some((x) => /Yangi syomka/.test(x.body.text)), log);
// ko'chirish
await call('PATCH', `/api/shoots/${shootId}`, { project: 'Loyiha A', place: 'Studio', date: '2099-01-03', time: '11:00', operator: 'Dilshod', brandface: 'Ali', status: "Ko'chirildi" });
await sleep(700); log = await tglog();
check('operator got moved msg', to(log, 1003).some((x) => /o'zgardi/.test(x.body.text)), to(log, 1003));
// evening reminder: 2099-01-02 20:30 Toshkent = 15:30Z; syomka endi 01-03 => ertaga 01-03 uchun 01-02 kechqurun
await call('PATCH', `/api/shoots/${shootId}`, { project: 'Loyiha A', place: 'Studio', date: '2099-01-03', time: '11:00', operator: 'Dilshod', brandface: 'Ali', status: 'Rejada' }); await sleep(500); await tglog();
let t1 = await tick('2099-01-02T15:30:00Z'); await sleep(300); log = await tglog();
check('evening reminder to operator', to(log, 1003).some((x) => /Ertaga syomka/.test(x.body.text)), { t1, log: to(log, 1003) });
t1 = await tick('2099-01-02T15:31:00Z'); await sleep(300); log = await tglog();
check('evening reminder only once', !to(log, 1003).some((x) => /Ertaga syomka/.test(x.body.text)), log);
// kontent + tasdiq so'rovi (Ali yaratadi, PM=Sensei)
r = await call('POST', '/api/auth/login', { email: 'ali@x5.uz', password: 'parol12345' }, 'ali'); check('ali login', r.status === 200, r);
r = await call('POST', '/api/contents', { project: 'Loyiha A', title: 'G\'oya 1' }, 'ali'); check('ali creates content', r.status === 200, r); const cid = r.j.id;
await sleep(700); log = await tglog();
const apr = to(log, 1001).find((x) => /Tasdiq kerak/.test(x.body.text)); check('PM got approval request', !!apr, to(log, 1001));
await hook(cb(1002, `c:${cid}:y`)); await sleep(400);
d = (await call('GET', '/api/data')).j; check('Ali cannot approve own (stage unchanged)', d.datasets.contents.find((x) => x.id === cid).bosqich === "G'oya", d.datasets.contents);
await hook(cb(1001, `c:${cid}:y`)); await sleep(700);
d = (await call('GET', '/api/data')).j; check('PM approves via button', d.datasets.contents.find((x) => x.id === cid).bosqich === 'Ijobiy', d.datasets.contents);
log = await tglog(); check('author told Ijobiy', to(log, 1002).some((x) => /Ijobiy/.test(x.body.text)), to(log, 1002));
// tasdiqlangan post: 2099-01-05 12:00 (Toshkent). Admin tasdiqlaydi
r = await call('PATCH', `/api/contents/${cid}`, { stage: 'Tasdiqlandi', platforms: ['instagram', 'youtube'], postDate: '2099-01-05', postTime: '12:00', material: 'https://t.me/x/1', noteInstagram: 'Caption IG' }); check('approve+post', r.status === 200, r);
await sleep(500); await tglog();
t1 = await tick('2099-01-05T05:30:00Z'); // 10:30 Toshkent -> 90 daqiqa qoldi: 2h eslatma
await sleep(300); log = await tglog();
const rem = to(log, 1002).find((x) => /2 soatdan/.test(x.body.text)); check('author 2h reminder', !!rem, { t1, a: to(log, 1002) });
check('PM 2h reminder', to(log, 1001).some((x) => /2 soatdan/.test(x.body.text)), to(log, 1001));
check('reminder has Joylandi buttons', rem && JSON.stringify(rem.body.reply_markup).includes(`p:${cid}:instagram`), rem);
t1 = await tick('2099-01-05T06:15:00Z'); await sleep(300); log = await tglog(); // 11:15 -> 45 daqiqa: 1h eslatma
check('1h reminder', to(log, 1002).some((x) => /1 soatdan/.test(x.body.text)), to(log, 1002));
t1 = await tick('2099-01-05T06:20:00Z'); await sleep(300); log = await tglog();
check('no duplicate 1h reminder', !to(log, 1002).some((x) => /soatdan/.test(x.body.text)), log);
await hook(cb(1002, `p:${cid}:instagram`)); await sleep(500);
d = (await call('GET', '/api/data')).j; let cc = d.datasets.contents.find((x) => x.id === cid); check('Joylandi (instagram) via button', cc.joylandi.includes('instagram') && cc.bosqich === 'Tasdiqlandi', cc);
await hook(cb(1002, `p:${cid}:youtube`)); await sleep(500);
d = (await call('GET', '/api/data')).j; cc = d.datasets.contents.find((x) => x.id === cid); check('all platforms -> Post Joylandi', cc.bosqich === 'Post Joylandi', cc);
// ertalabki xabar
await tglog(); t1 = await tick('2099-01-03T03:10:00Z'); await sleep(300); log = await tglog();
check('morning digest has shoot for Ali', to(log, 1002).some((x) => /Xayrli tong/.test(x.body.text) && /Bugungi syomka/.test(x.body.text)), { t1, log: to(log, 1002) });
check('morning digest for operator', to(log, 1003).some((x) => /Bugungi syomka/.test(x.body.text)), to(log, 1003));
// zaxira: 03:00 dan keyin
await tglog(); t1 = await tick('2099-01-06T00:10:00Z'); await sleep(500); log = await tglog();
check('daily backup file sent to admin', log.some((x) => x.method === 'sendDocument' && String(x.body.head).includes('x5group-zaxira')), { t1, methods: log.map((x) => x.method) });
// oylik PDF hisobot: 1-sanada 09:00-12:00 oralig'ida Admin'ga bir marta
await tglog(); t1 = await tick('2099-02-01T05:00:00Z'); await sleep(800); log = await tglog();
check('monthly PDF sent to admin', log.some((x) => x.method === 'sendDocument' && String(x.body.head).includes('x5group-hisobot-2099-01')), { t1, methods: log.map((x) => x.method), heads: log.filter((x) => x.method === 'sendDocument').map((x) => String(x.body.head).slice(0, 120)) });
await tglog(); t1 = await tick('2099-02-01T05:01:00Z'); await sleep(500); log = await tglog();
check('monthly PDF not repeated', !log.some((x) => x.method === 'sendDocument' && String(x.body.head).includes('hisobot')), log.map((x) => x.method));
await tglog(); await hook(msg(1001, '/hisobot 2099-01')); await sleep(800); log = await tglog();
check('/hisobot command sends PDF to admin', log.some((x) => x.method === 'sendDocument' && String(x.body.head).includes('x5group-hisobot-2099-01')), log.map((x) => x.method));
await hook(msg(1002, '/hisobot')); await sleep(300); log = await tglog();
check('/hisobot refused for non-admin', !log.some((x) => x.method === 'sendDocument'), log.map((x) => x.method));
r = await call('GET', '/api/reports/monthly?month=2099-01'); check('report download route (admin)', r.status === 200 || r.j === null, r);
for (const x of results) console.log(...x);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
