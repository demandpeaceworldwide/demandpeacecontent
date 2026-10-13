// Local stand-in for Vercel: serves public/ and /api/* backed by in-memory Postgres (PGlite).
// Data vanishes when it stops. For checking the Python worker and the page without any account.
//   DP_KEY=dev DP_WORKER_KEY=devworker node test/devserver.js
process.env.DP_KEY = process.env.DP_KEY || 'dev';
process.env.DP_WORKER_KEY = process.env.DP_WORKER_KEY || 'devworker';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const pg = new PGlite();
globalThis.__DP_QUERY__ = async (t, p) => (await pg.query(t, p)).rows;
const root = path.join(__dirname, '..');

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const file = path.join(root, u.pathname + '.js');
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
    let raw = ''; for await (const c of req) raw += c;
    req.query = Object.fromEntries(u.searchParams);
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = undefined; }
    const origEnd = res.end.bind(res);
    res.setHeader = res.setHeader.bind(res);
    try { return await require(file)(req, res); }
    catch (e) { console.error(e); res.statusCode = 500; return origEnd(JSON.stringify({ error: String(e.message) })); }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root, 'public', 'index.html')));
}).listen(Number(process.env.DP_PORT || 8788), () => console.log('dev server on http://127.0.0.1:' + (process.env.DP_PORT || 8788) + '/?k=' + process.env.DP_KEY));
