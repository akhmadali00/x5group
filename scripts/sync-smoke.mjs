// Sinov: node scripts/sync-smoke.mjs  (dev-db, fake-telegram, fake-meta, next dev; baza bo'sh)
const BASE = 'http://localhost:3100', TG = 'http://127.0.0.1:54400', MT = 'http://127.0.0.1:54402';
const jars = {}; const results = [];
const check = (n, c, x) => results.push([c ? 'OK  ' : 'FAIL', n, c ? '' : JSON.stringify(x)?.slice(0, 700)]);
async function call(method, path, body, jar = 'a') {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie: jars[jar] || '' }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) jars[jar] = sc.map((c) => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const hook = (update) => fetch(BASE + '/api/telegram', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'whsecret-test' }, body: JSON.stringify(update) });
const tglog = async () => (await fetch(TG + '/_log?clear=1')).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (iso) => (await fetch(BASE + '/api/cron/tick?now=' + encodeURIComponent(iso), { headers: { authorization: 'Bearer cronsecret-test' } })).json();

await tglog(); await fetch(MT + '/_calls?clear=1');
let r = await call('POST', '/api/auth/setup', { name: 'Sensei', email: 's@x5.uz', password: 'parol12345' }); check('setup', r.status === 200, r);
r = await call('POST', '/api/projects', { name: 'Loyiha A', pms: ['Sensei'], adsSource: 'Meta', adAccount: 'act_111', tgLink: 'https://t.me/kanal_a', ytLink: 'https://youtube.com/@kanal', igLink: 'https://instagram.com/akk_a', igStart: 100 }); check('project', r.status === 200, r);
r = await call('POST', '/api/projects', { name: 'Loyiha X', adAccount: '222' }); check('project X (error acct)', r.status === 200, r);
// admin bot ulash
r = await call('POST', '/api/telegram/link', {}); const code = r.j?.url?.split('start=')[1];
await hook({ message: { chat: { id: 1001, type: 'private' }, from: { username: 'sensei', first_name: 'S' }, text: '/start ' + code } }); await sleep(300); await tglog();

// qo'lda yangilash
r = await call('POST', '/api/sync'); check('manual sync ok', r.status === 200 && r.j.meta.campaigns === 4 && r.j.meta.accounts === 1, r);
check('error account reported, others continue', r.j?.meta?.errors.some((e) => /Loyiha X/.test(e) && /Permissions/.test(e)), r.j?.meta);
let d = (await call('GET', '/api/data')).j;
const A = d.datasets.profiles.find((p) => p.loyiha === 'Loyiha A');
check('followers updated (tg/yt/ig)', A.tg_hozir === 1234 && A.yt_hozir === 5678 && A.ig_hozir === 9876, A);
check('start values: set only when empty', A.tg_boshlang === 1234 && A.ig_boshlang === 100, A);
const cs = d.datasets.campaigns;
const c1 = cs.find((c) => c.kampaniya === 'Lid kampaniya A'), c2 = cs.find((c) => c.kampaniya === 'Lid kampaniya B'), c3 = cs.find((c) => c.kampaniya === 'Video');
check('campaign A mapped', c1 && c1.maqsad === 'LID' && c1.natija === 100 && c1.sarflandi === 1000000 && c1.kunlik === 50000 && c1.holati === 'Faol' && c1.video3s === 2000 && c1.sana === '2026-10-01', c1);
check('lead = lead + messaging', c2 && c2.natija === 70 && c2.lid === 70, c2);
check('video campaign paused with thruplay', c3 && c3.holati === "To'xtatilgan" && c3.maqsad === 'Prosmotr' && c3.natija === 8000 && c3.thruplay === 8000, c3);
check('daily results saved, complete flag', d.datasets.daily.length === 3 && d.datasets.daily.find((x) => x.sana === '2026-10-26')?.toliq === 1 && d.datasets.daily.find((x) => x.sana === '2099-01-01')?.toliq === 0, d.datasets.daily);
check('syncAt exposed', !!d.syncAt, d.syncAt);
// idempotent: ikkinchi marta dublikat yaratmaydi
r = await call('POST', '/api/sync'); d = (await call('GET', '/api/data')).j;
check('no duplicate campaigns on re-sync', d.datasets.campaigns.length === 4 && d.datasets.daily.length === 3, d.datasets.campaigns.length);
// signal: natijasiz kampaniya, CPR yuqori (B: 3M/70=42857 vs A: 10000 -> 4.3x), A: arzon
await sleep(500); let log = await tglog();
const msgs = log.filter((x) => x.method === 'sendMessage' && String(x.body.chat_id) === '1001').map((x) => x.body.text);
check('signal: no results', msgs.some((t) => /Natija yo'q/.test(t) && /Natijasiz/.test(t)), msgs);
check('signal: CPR high', msgs.some((t) => /CPR yuqori/.test(t) && /kampaniya B/.test(t)), msgs);
check('signal: good CPR', msgs.some((t) => /Yaxshi natija/.test(t) && /kampaniya A/.test(t)), msgs);
check('signals not repeated within week', msgs.filter((t) => /Natija yo'q/.test(t)).length === 1, msgs);
// manba tekshiruvi: so'rovlarda token URL'da emas, sarlavhada
const calls = await (await fetch(MT + '/_calls')).json();
check('token only in header, never in URL', calls.length > 0 && calls.every((c) => !('access_token' in c.q)) && calls.filter((c) => !c.path.startsWith('/youtube')).every((c) => c.auth === 'Bearer meta-test'), calls.slice(0, 3));
// cron: har 3 soatda bir marta
await fetch(MT + '/_calls?clear=1');
let t1 = await tick('2099-03-02T03:10:00Z'); await sleep(800); // 08:10 Toshkent -> slot 2
let n1 = (await (await fetch(MT + '/_calls')).json()).length;
check('cron runs sync', n1 > 0, n1);
await fetch(MT + '/_calls?clear=1'); t1 = await tick('2099-03-02T03:11:00Z'); await sleep(500);
check('cron sync not repeated in same slot', (await (await fetch(MT + '/_calls')).json()).length === 0);
// bot buyrug'i
await tglog(); await hook({ message: { chat: { id: 1001, type: 'private' }, from: { username: 'sensei' }, text: '/yangila' } }); await sleep(1200); log = await tglog();
check('/yangila replies summary', log.some((x) => x.method === 'sendMessage' && /Yangilandi/.test(x.body.text || '') && /4 kampaniya/.test(x.body.text)), log.map((x) => x.body.text));
// ruxsat: oddiy a'zo sync qila olmaydi
r = await call('POST', '/api/members', { kind: 'account', name: 'Ali', email: 'ali@x5.uz', password: 'parol12345', position: 'Kontent Maker', role: 'member', permissions: ['bosh'], projects: [] });
await call('POST', '/api/auth/login', { email: 'ali@x5.uz', password: 'parol12345' }, 'b');
r = await call('POST', '/api/sync', undefined, 'b'); check('member cannot sync', r.status === 403, r);
r = await call('GET', '/api/sync', undefined, 'b'); check('member cannot see sync status', r.status === 403, r);
for (const x of results) console.log(...x);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
