const { query, ensure } = require('../lib/db');
const { mediaLink } = require('../lib/media');
const { userOk, json } = require('../lib/util');
const GROUPS = {
  review: ['new'], production: ['approved', 'needs_manual', 'rendering', 'rendered', 'failed', 'revision'],
  final: ['ready'], scheduled: ['scheduled'], published: ['published'],
  history: ['skipped', 'final_approved'],
};
module.exports = async (req, res) => {
  if (!userOk(req)) return json(res, 403, { error: 'This link is invalid or has expired. Ask Tehron for a new link.' });
  if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
  const view = req.query.view || 'review';
  if (!GROUPS[view]) return json(res, 400, { error: 'Unknown view' });
  const offset = Math.max(0, Math.min(100000, parseInt(req.query.offset, 10) || 0));
  await ensure();
  // Operator error notes stay out of the client response.
  const items = await query(`SELECT id, source, ext_id, url, title, channel, published, thumb,
    status, headline, start_sec, version, video_url, caption, client_feedback, added_at, decided_at, updated_at
    FROM items WHERE status = ANY($1::text[]) ORDER BY COALESCE(published,'') DESC, id DESC LIMIT 20 OFFSET $2`, [GROUPS[view], offset]);
  const clientItems = items.map(item => {
    if (!item.video_url) return item;
    try {
      const media = mediaLink(item.video_url);
      return { ...item, video_url: media.url, video_provider: media.provider, video_preview_url: media.preview };
    } catch { return { ...item, video_url: null }; }
  });
  const grouped = await query('SELECT status, COUNT(*)::int AS c FROM items GROUP BY status');
  const statuses = Object.fromEntries(grouped.map(r => [r.status, r.c]));
  const counts = Object.fromEntries(Object.entries(GROUPS).map(([k, values]) => [k, values.reduce((n, status) => n + (statuses[status] || 0), 0)]));
  json(res, 200, { items: clientItems, counts, total: counts[view], offset, hasMore: offset + items.length < counts[view],
    left: counts.review, approved: ['approved', 'rendering', 'rendered', 'ready', 'final_approved', 'scheduled', 'published'].reduce((n, s) => n + (statuses[s] || 0), 0) });
};
