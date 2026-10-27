// Sinov uchun soxta Anthropic Messages API
import http from 'node:http';
const port = Number(process.argv[2] || 54401);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  let b = {}; try { b = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
  const last = b.messages?.[b.messages.length - 1];
  res.setHeader('content-type', 'application/json');
  const reply = (content) => res.end(JSON.stringify({ id: 'x', type: 'message', role: 'assistant', content, stop_reason: 'end_turn' }));
  if (Array.isArray(last?.content) && last.content[0]?.type === 'tool_result') {
    const r = last.content[0];
    return reply([{ type: 'text', text: r.is_error ? 'XATO: ' + r.content : 'NATIJA: ' + r.content.slice(0, 300) }]);
  }
  const t = String(last?.content || '');
  if (/yarat/.test(t)) return reply([{ type: 'tool_use', id: 'tu1', name: 'create_task', input: { assignee: 'Ali', title: 'AI vazifa', durationDays: 2 } }]);
  if (/vazifa/.test(t)) return reply([{ type: 'tool_use', id: 'tu2', name: 'get_data', input: { kind: 'tasks' } }]);
  reply([{ type: 'text', text: 'Salom! (system: ' + String(b.system).slice(0, 60) + ')' }]);
}).listen(port, '127.0.0.1', () => console.log('fake anthropic on', port));
