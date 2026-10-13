const { query, ensure } = require('../lib/db');
const { userOk, json, body } = require('../lib/util');
module.exports = async (req, res) => {
  if (!userOk(req)) return json(res, 403, { error: 'Invalid review link' });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const b = body(req), id = Number(b.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(b.version) || b.version < 0) return json(res, 400, { error: 'Invalid item version' });
  await ensure();
  let rows;
  if (b.action === 'draft') {
    const start = Number(b.start || 0), headline = String(b.headline || '').trim();
    if (!Number.isSafeInteger(start) || start < 0 || start > 86400 || headline.length > 80) return json(res, 400, { error: 'Check headline and start time' });
    rows = await query(`UPDATE items SET headline=$1, start_sec=$2, updated_at=now(), version=version+1
      WHERE id=$3 AND status='new' AND version=$4 RETURNING version`, [headline, start, id, b.version]);
  } else if (b.action === 'undo') {
    // Atomic guard: once a worker claims an item, it cannot be withdrawn.
    rows = await query(`UPDATE items SET status='new', decided_at=NULL, updated_at=now(), version=version+1
      WHERE id=$1 AND status IN ('approved','needs_manual','skipped') AND version=$2 RETURNING version`, [id, b.version]);
  } else if (b.action === 'approve_final' || b.action === 'request_changes') {
    const feedback = String(b.feedback || '').trim().slice(0, 1000);
    if (b.action === 'request_changes' && !feedback) return json(res, 400, { error: 'Tell us what to change' });
    const caption = String(b.caption || '').trim();
    if (caption.length > 2200) return json(res, 400, { error: 'Caption must be 2,200 characters or fewer' });
    rows = await query(`UPDATE items SET status=$1, caption=$2, client_feedback=$3,
      updated_at=now(), version=version+1 WHERE id=$4 AND status='ready' AND video_url IS NOT NULL AND version=$5 RETURNING version`,
      [b.action === 'approve_final' ? 'final_approved' : 'revision', caption, feedback || null, id, b.version]);
  } else return json(res, 400, { error: 'Unknown action' });
  if (!rows.length) return json(res, 409, { error: 'This item changed or production has started. Refresh to see its latest status.' });
  json(res, 200, { ok: true, ...rows[0] });
};
