const crypto = require('crypto');

function safeEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Noah's private link: ?k=<DP_KEY>. A shared link, not a login; fine for a two-person tool.
function userOk(req) {
  const key = process.env.DP_KEY;
  return Boolean(key) && safeEq((req.query && req.query.k) || '', key);
}

// The Python worker on Tehron's Mac: header x-worker-key.
function workerOk(req) {
  const key = process.env.DP_WORKER_KEY;
  return Boolean(key) && safeEq(req.headers['x-worker-key'] || '', key);
}

// Default on-screen headline: drop hashtags and emoji from a video title.
function cleanTitle(t) {
  return String(t || '')
    .replace(/#\w+/g, '')
    .replace(/[^\p{L}\p{N}\s'’\-:?,.&$%/]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:,]+|[\s\-:,]+$/g, '');
}

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/;
const X_RE = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/\w+\/status\/\d+/;

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  return b;
}

module.exports = { userOk, workerOk, cleanTitle, YT_RE, X_RE, json, body };
