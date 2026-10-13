// Endpoints for Tehron's Mac worker (the Python scripts). Auth: header x-worker-key.
//   POST {action:'ingest', items:[{ext_id,url,title,channel,published,thumb}]}  -> add new YouTube items
//   GET  ?action=approved                                                       -> items waiting to be rendered
//   GET  ?action=manual                                                         -> X items Tehron must source by hand
//   POST {action:'mark', id, status:'rendered'|'failed', note}                  -> report the result
const { query, ensure } = require('../lib/db');
const { workerOk, json, body, cleanTitle } = require('../lib/util');

module.exports = async (req, res) => {
  if (!workerOk(req)) return json(res, 403, { error: 'Forbidden' });
  await ensure();

  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'approved') {
      return json(res, 200, { items: await query(
        "SELECT * FROM items WHERE status='approved' AND source='youtube' ORDER BY decided_at") });
    }
    if (action === 'manual') {
      return json(res, 200, { items: await query(
        "SELECT * FROM items WHERE status='needs_manual' ORDER BY decided_at") });
    }
    return json(res, 400, { error: 'unknown action' });
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'GET or POST' });
  const b = body(req);

  if (b.action === 'ingest') {
    let added = 0;
    for (const it of (b.items || []).slice(0, 200)) {
      const r = await query(
        `INSERT INTO items (source, ext_id, url, title, channel, published, thumb, headline)
         VALUES ('youtube',$1,$2,$3,$4,$5,$6,$7) ON CONFLICT (source, ext_id) DO NOTHING RETURNING id`,
        [String(it.ext_id), String(it.url), it.title || '', it.channel || '', it.published || null,
          it.thumb || null, cleanTitle(it.title)]);
      added += r.length;
    }
    return json(res, 200, { ok: true, added });
  }

  if (b.action === 'mark') {
    if (!['rendered', 'failed'].includes(b.status)) return json(res, 400, { error: 'bad status' });
    await query('UPDATE items SET status=$1, note=$2 WHERE id=$3',
      [b.status, String(b.note || '').slice(0, 300) || null, Number(b.id)]);
    return json(res, 200, { ok: true });
  }

  json(res, 400, { error: 'unknown action' });
};
