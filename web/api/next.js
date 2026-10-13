const { query, ensure } = require('../lib/db');
const { userOk, json } = require('../lib/util');

module.exports = async (req, res) => {
  if (!userOk(req)) return json(res, 403, { error: 'Private page.' });
  await ensure();
  const items = await query(
    "SELECT * FROM items WHERE status='new' ORDER BY COALESCE(published,'') DESC, id DESC LIMIT 10");
  const left = await query("SELECT COUNT(*)::int AS c FROM items WHERE status='new'");
  const ok = await query("SELECT COUNT(*)::int AS c FROM items WHERE status IN ('approved','rendered')");
  json(res, 200, { items, left: left[0].c, approved: ok[0].c });
};
