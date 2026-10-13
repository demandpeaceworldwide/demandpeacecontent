const { query, ensure } = require('../lib/db');
const { userOk, json, body, cleanTitle, YT_RE, X_RE } = require('../lib/util');

async function oembed(vid) {
  try {
    const u = 'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`);
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return await r.json();
  } catch { /* fall through to defaults */ }
  return {};
}

module.exports = async (req, res) => {
  if (!userOk(req)) return json(res, 403, { error: 'Private page.' });
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  await ensure();
  const url = String(body(req).url || '');
  const yt = YT_RE.exec(url);
  if (yt) {
    const vid = yt[1];
    const o = await oembed(vid);
    const title = o.title || 'YouTube video';
    const r = await query(
      `INSERT INTO items (source, ext_id, url, title, channel, thumb, headline)
       VALUES ('youtube',$1,$2,$3,$4,$5,$6) ON CONFLICT (source, ext_id) DO NOTHING RETURNING id`,
      [vid, url.includes('/shorts/') ? `https://www.youtube.com/shorts/${vid}` : `https://www.youtube.com/watch?v=${vid}`, title, o.author_name || '',
        `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, cleanTitle(title)]);
    return json(res, 200, { ok: true, result: r.length ? 'added' : 'already in the queue' });
  }
  const x = X_RE.exec(url);
  if (x) {
    const r = await query(
      `INSERT INTO items (source, ext_id, url, title, channel, headline)
       VALUES ('x',$1,$1,'X post (signal only)','X','') ON CONFLICT (source, ext_id) DO NOTHING RETURNING id`,
      [x[0]]);
    return json(res, 200, { ok: true, result: r.length ? 'added' : 'already in the queue' });
  }
  json(res, 400, { error: 'Paste a YouTube or X link.' });
};
