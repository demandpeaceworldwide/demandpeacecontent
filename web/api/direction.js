const { query, ensure } = require('../lib/db');
const { userOk, json, body } = require('../lib/util');
module.exports = async (req, res) => {
  if (!userOk(req)) return json(res, 403, { error: 'Invalid review link' });
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'GET or POST only' });
  await ensure();
  if (req.method === 'GET') return json(res, 200, { direction: (await query('SELECT * FROM project_direction WHERE id=1'))[0] });
  const b = body(req);
  if (!Number.isSafeInteger(b.version) || b.version < 0) return json(res, 400, { error: 'Invalid direction version' });
  const values = ['topics','avoid','creators','examples'].map(k => String(b[k] || '').trim());
  if (values.some(v => v.length > 2000)) return json(res, 400, { error: 'Each direction field must be 2,000 characters or fewer' });
  const rows = await query(`UPDATE project_direction SET topics=$1, avoid=$2, creators=$3, examples=$4,
    version=version+1, updated_at=now() WHERE id=1 AND version=$5 RETURNING *`, [...values, b.version]);
  if (!rows.length) return json(res, 409, { error: 'Direction was updated elsewhere. Reload the saved version before editing again.' });
  json(res, 200, { direction: rows[0] });
};
