// Sinov uchun soxta Telegram Bot API: node scripts/fake-telegram.mjs [port]
import http from 'node:http';
const port = Number(process.argv[2] || 54400);
let log = [];
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/_log') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(log)); if (url.searchParams.get('clear')) log = []; return; }
  const m = url.pathname.match(/^\/bot[^/]+\/(\w+)$/);
  if (!m) { res.statusCode = 404; res.end('{}'); return; }
  let body = {};
  const ct = req.headers['content-type'] || '';
  if (ct.includes('json')) { try { body = JSON.parse(raw.toString()); } catch {} }
  else body = { _multipart: true, bytes: raw.length, head: raw.toString('utf8', 0, 400) };
  log.push({ method: m[1], body });
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true, result: { message_id: log.length } }));
}).listen(port, '127.0.0.1', () => console.log('fake telegram on', port));
