// Sinov: avto-joylash (baza, soxta Telegram va dev server ishlab turishi kerak)
const BASE = 'http://localhost:3100', TG = 'http://127.0.0.1:54400';
const jars = {}; const results = [];
const check = (n, c, x) => results.push([c ? 'OK  ' : 'FAIL', n, c ? '' : JSON.stringify(x)?.slice(0, 700)]);
async function call(method, path, body, jar = 'a') {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie: jars[jar] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) jars[jar] = sc.map((c) => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const hook = (u) => fetch(BASE + '/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'whsecret-test' }, body: JSON.stringify(u) });
const tglog = async () => (await fetch(TG + '/_log?clear=1')).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (iso) => { const r = await (await fetch(BASE + '/api/cron/tick?now=' + encodeURIComponent(iso), { headers: { authorization: 'Bearer cronsecret-test' } })).json(); await sleep(500); return r; };
const channel = (log) => log.filter((x) => ['sendMessage', 'sendPhoto', 'sendVideo'].includes(x.method) && String(x.body.chat_id).startsWith('@'));
const adminMsgs = (log) => log.filter((x) => x.method === 'sendMessage' && String(x.body.chat_id) === '1001').map((x) => x.body.text);

await tglog();
let r = await call('POST', '/api/auth/setup', { name: 'Sensei', email: 's@x5.uz', password: 'parol12345' });
await call('POST', '/api/projects', { name: 'Kanalli', pms: ['Sensei'], tgLink: 'https://t.me/kanal_a' });
await call('POST', '/api/projects', { name: 'Kanalsiz', pms: ['Sensei'] });
r = await call('POST', '/api/telegram/link', {}); const code = r.j.url.split('start=')[1];
await hook({ message: { chat: { id: 1001, type: 'private' }, from: { username: 'sensei', first_name: 'S' }, text: '/start ' + code } }); await sleep(300); await tglog();
const mk = async (project, title, extra = {}) => (await call('POST', '/api/contents', { project, title, stage: 'Tasdiqlandi', platforms: ['telegram'], autoPost: true, postDate: '2099-04-10', postTime: '10:00', ...extra })).status;
check('create C1 (text, auto)', (await mk('Kanalli', 'C1 matnli', { noteTelegram: 'Salom kanal!' })) === 200);
check('create C2 (photo)', (await mk('Kanalli', 'C2 rasmli', { material: 'https://cdn.example/x/y.jpg', noteTelegram: 'Rasm izohi', postTime: '10:01' })) === 200);
check('create C3 (not auto)', (await mk('Kanalli', 'C3 qo\'lda', { autoPost: false, noteTelegram: 'qo\'lda' })) === 200);
check('create C4 (late: 02:00)', (await mk('Kanalli', 'C4 kech', { postTime: '02:00', noteTelegram: 'kech' })) === 200);
check('create C5 (no channel)', (await mk('Kanalsiz', 'C5 kanalsiz', { noteTelegram: 'x' })) === 200);
check('create C6 (instagram+telegram)', (await mk('Kanalli', 'C6 ikki platforma', { platforms: ['telegram', 'instagram'], noteTelegram: 'ikki', postTime: '10:02' })) === 200);
await tglog();

await tick('2099-04-10T04:59:00Z'); // 09:59 Toshkent
let log = await tglog();
check('nothing posted before time', channel(log).length === 0, channel(log));
check('late warning (C4) sent once to admin at first tick', adminMsgs(log).filter((t) => /vaqt o'tib ketgan/.test(t) && /C4/.test(t)).length === 1, adminMsgs(log));

await tick('2099-04-10T05:05:00Z'); // 10:05
log = await tglog();
const ch = channel(log);
check('C1 text posted to @kanal_a', ch.some((x) => x.method === 'sendMessage' && x.body.chat_id === '@kanal_a' && x.body.text === 'Salom kanal!'), ch);
check('C2 photo with caption', ch.some((x) => x.method === 'sendPhoto' && x.body.photo === 'https://cdn.example/x/y.jpg' && x.body.caption === 'Rasm izohi'), ch);
check('C6 posted (telegram part)', ch.some((x) => x.body.text === 'ikki'), ch);
check('manual (C3) and late (C4) not posted', !ch.some((x) => ["qo'lda", 'kech'].includes(x.body.text)), ch);
check('no-channel C5 not posted yet (retrying)', !ch.some((x) => x.body.text === 'x'), ch);
check('late warning not repeated', adminMsgs(log).filter((t) => /vaqt o'tib ketgan/.test(t)).length === 0, adminMsgs(log));
check('admin told auto-posted', adminMsgs(log).some((t) => /Avtomatik joylandi/.test(t) && /C1/.test(t) && /t\.me\/kanal_a\/\d+/.test(t)), adminMsgs(log));
let d = (await call('GET', '/api/data')).j.datasets.contents;
const g = (n) => d.find((c) => c.nomi.startsWith(n));
check('C1 -> Post Joylandi + link', g('C1').bosqich === 'Post Joylandi' && g('C1').joylandi === 'telegram' && /^https:\/\/t\.me\/kanal_a\/\d+$/.test(g('C1').havola_telegram), g('C1'));
check('C6 stays Tasdiqlandi (instagram pending)', g('C6').bosqich === 'Tasdiqlandi' && g('C6').joylandi === 'telegram', g('C6'));
check('C3/C4 untouched', g('C3').joylandi === '' && g('C4').joylandi === '', [g('C3'), g('C4')]);

await tick('2099-04-10T05:06:00Z'); log = await tglog();
check('no duplicate posts', channel(log).filter((x) => ['Salom kanal!', 'ikki'].includes(x.body.text) || x.method === 'sendPhoto').length === 0, channel(log));
await tick('2099-04-10T05:07:00Z'); log = await tglog();
const a5 = adminMsgs(log).filter((t) => /Avtomatik joylab bo'lmadi/.test(t) && /C5/.test(t));
check('C5 gives up after 3 tries and alerts once', a5.length === 1 && /kanal havolasi/.test(a5[0]), adminMsgs(log));
await tick('2099-04-10T05:08:00Z'); log = await tglog();
check('C5 no repeated alert', adminMsgs(log).filter((t) => /C5/.test(t)).length === 0, adminMsgs(log));
for (const x of results) console.log(...x);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
