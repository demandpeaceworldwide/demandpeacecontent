const { query, ensure } = require('../lib/db');
const { userOk, json, body } = require('../lib/util');
module.exports = async (req, res) => {
  if (!userOk(req)) return json(res, 403, { error: 'Invalid review link' });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const b = body(req);
  if (!Number.isSafeInteger(Number(b.id)) || Number(b.id) <= 0) return json(res, 400, { error: 'Invalid item' });
  if (!['yes', 'no'].includes(b.decision)) return json(res, 400, { error: 'decision must be yes or no' });
  if (b.version !== undefined && (!Number.isSafeInteger(b.version) || b.version < 0)) return json(res, 400, { error: 'Invalid item version' });
  const start = Number(b.start || 0);
  if (!Number.isSafeInteger(start) || start < 0 || start > 86400) return json(res, 400, { error: 'Start time must be between 0 and 24 hours' });
  await ensure();
  const rows = await query(`UPDATE items SET status=CASE WHEN $1='no' THEN 'skipped'
    WHEN source='x' THEN 'needs_manual' ELSE 'approved' END,
    headline=COALESCE($2, headline), start_sec=$3, decided_at=now(), updated_at=now(), version=version+1
    WHERE id=$4 AND status='new' AND ($5::integer IS NULL OR version=$5) RETURNING status, version`,
    [b.decision, String(b.headline || '').trim().slice(0, 80) || null, start, Number(b.id), b.version ?? null]);
  if (!rows.length) {
    const exists = await query('SELECT id FROM items WHERE id=$1', [Number(b.id)]);
    return json(res, exists.length ? 409 : 404, { error: exists.length ? 'This item changed. Refresh before deciding again.' : 'No such item' });
  }
  json(res, 200, { ok: true, ...rows[0] });
};
