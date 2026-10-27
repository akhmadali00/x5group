// Sinov uchun soxta Meta Graph + YouTube API: node scripts/fake-meta.mjs [port]
import http from 'node:http';
const port = Number(process.argv[2] || 54402);
let calls = [];
const send = (res, o, code = 200) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (p === '/_calls') { send(res, calls); if (url.searchParams.get('clear')) calls = []; return; }
  calls.push({ path: p, q: Object.fromEntries(url.searchParams), auth: req.headers.authorization || req.headers['x-goog-api-key'] || '' });
  if (p.startsWith('/youtube/v3/channels')) {
    if (req.headers['x-goog-api-key'] !== 'yt-test') return send(res, { error: { message: 'bad key' } }, 403);
    return send(res, { items: [{ statistics: { subscriberCount: '5678' } }] });
  }
  if (req.headers.authorization !== 'Bearer meta-test') return send(res, { error: { message: 'Invalid OAuth access token' } }, 401);
  if (p === '/v21.0/act_111') return send(res, { currency: 'UZS' });
  if (p === '/v21.0/act_222') return send(res, { error: { message: 'Permissions error' } }, 403);
  if (p === '/v21.0/act_111/campaigns') return send(res, { data: [
    { id: 'c1', name: 'Lid kampaniya A', effective_status: 'ACTIVE', objective: 'OUTCOME_LEADS', daily_budget: '5000000', start_time: '2026-10-01T10:00:00+0500' },
    { id: 'c2', name: 'Lid kampaniya B', effective_status: 'ACTIVE', objective: 'OUTCOME_LEADS', daily_budget: '5000000', start_time: '2026-10-02T10:00:00+0500' },
    { id: 'c3', name: 'Video', effective_status: 'PAUSED', objective: 'OUTCOME_AWARENESS', daily_budget: '2000000', start_time: '2026-09-20T10:00:00+0500' },
    { id: 'c4', name: 'Natijasiz', effective_status: 'ACTIVE', objective: 'OUTCOME_LEADS', daily_budget: '1000000', start_time: '2026-10-05T10:00:00+0500' }
  ] });
  if (p === '/v21.0/act_111/insights') {
    if (url.searchParams.get('level') === 'campaign') return send(res, { data: [
      { campaign_id: 'c1', spend: '1000000', impressions: '50000', reach: '30000', actions: [{ action_type: 'lead', value: '100' }, { action_type: 'video_view', value: '2000' }] },
      { campaign_id: 'c2', spend: '3000000', impressions: '40000', reach: '25000', actions: [{ action_type: 'lead', value: '60' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' }] },
      { campaign_id: 'c3', spend: '500000', impressions: '90000', reach: '70000', actions: [{ action_type: 'video_view', value: '20000' }], video_thruplay_watched_actions: [{ action_type: 'video_view', value: '8000' }] },
      { campaign_id: 'c4', spend: '4000000', impressions: '10000', reach: '9000', actions: [] }
    ] });
    return send(res, { data: [
      { date_start: '2026-10-25', spend: '1500000', actions: [{ action_type: 'lead', value: '30' }] },
      { date_start: '2026-10-26', spend: '1200000', actions: [{ action_type: 'lead', value: '25' }] },
      { date_start: '2099-01-01', spend: '10', actions: [] }
    ] });
  }
  if (p === '/v21.0/999') return send(res, { business_discovery: { followers_count: 9876 } });
  send(res, { error: { message: 'unknown ' + p } }, 404);
}).listen(port, '127.0.0.1', () => console.log('fake meta on', port));
