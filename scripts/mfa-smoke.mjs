import { totpAt } from '../src/lib/crypto.ts';
const BASE = 'http://localhost:3100'; let cookie = ''; const results = [];
const check = (n, c, x) => results.push([c ? 'OK  ' : 'FAIL', n, c ? '' : JSON.stringify(x)?.slice(0, 400)]);
async function call(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-x5': '1', origin: BASE, cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
let r = await call('POST', '/api/auth/setup', { name: 'Sensei', email: 's@x5.uz', password: 'parol12345' }); check('setup', r.status === 200, r);
r = await call('POST', '/api/auth/totp/start'); check('start gives qr+secret', r.status === 200 && r.j.qr.startsWith('data:image/png') && r.j.secret, r);
const secret = r.j.secret;
r = await call('POST', '/api/auth/totp/enable', { code: '000000' }); check('wrong code refused', r.status === 400, r);
r = await call('POST', '/api/auth/totp/enable', { code: totpAt(secret, Date.now()) }); check('enable ok', r.status === 200, r);
r = await call('GET', '/api/session'); check('session ok state', r.j.state === 'ok' && r.j.me.totpEnabled, r);
await call('POST', '/api/auth/logout'); cookie = '';
r = await call('POST', '/api/auth/login', { email: 's@x5.uz', password: 'parol12345' }); check('login ok', r.status === 200, r);
r = await call('GET', '/api/session'); check('state mfa after password', r.j.state === 'mfa', r);
r = await call('GET', '/api/data'); check('data blocked before mfa', r.status === 403, r);
r = await call('POST', '/api/auth/mfa', { code: '123456' }); check('wrong mfa refused', r.status === 401, r);
r = await call('POST', '/api/auth/mfa', { code: totpAt(secret, Date.now()) }); check('mfa ok', r.status === 200, r);
r = await call('GET', '/api/data'); check('data after mfa', r.status === 200, r);
r = await call('POST', '/api/auth/totp/disable', { password: 'x', code: totpAt(secret, Date.now()) }); check('disable wrong password', r.status === 400, r);
r = await call('POST', '/api/auth/totp/disable', { password: 'parol12345', code: totpAt(secret, Date.now()) }); check('disable ok', r.status === 200, r);
for (const x of results) console.log(...x);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
