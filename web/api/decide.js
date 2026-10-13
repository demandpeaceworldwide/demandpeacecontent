const { query, ensure } = require('../lib/db');
const { userOk, json, body } = require('../lib/util');

module.exports = async (req, res) => {
  if (!userOk(req)) return json(res, 403, { error: 'Private page.' });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  await ensure();
  const b = body(req);
  let status = { yes: 'approved', no: 'skipped' }[b.decision];
  if (!status) return json(res, 400, { error: 'decision must be yes or no' });
  const found = await query('SELECT source, status FROM items WHERE id=$1', [Number(b.id)]);
  if (!found.length) return json(res, 404, { error: 'no such item' });
  if (found[0].status !== 'new') return json(res, 409, { error: 'already decided' });
  if (status === 'approved' && found[0].source === 'x') status = 'needs_manual'; // we never download from X
  const headline = String(b.headline || '').trim().slice(0, 80) || null;
  const start = Math.max(0, parseInt(b.start, 10) || 0);
  await query(
    'UPDATE items SET status=$1, headline=COALESCE($2, headline), start_sec=$3, decided_at=now() WHERE id=$4',
    [status, headline, start, Number(b.id)]);
  json(res, 200, { ok: true, status });
};
