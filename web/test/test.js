// Runs the API handlers against an in-memory Postgres (PGlite). No network, no Neon account needed.
process.env.DP_KEY = 'test-user-key';
process.env.DP_WORKER_KEY = 'test-worker-key';
const assert = require('assert');

(async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite();
  globalThis.__DP_QUERY__ = async (text, params) => (await pg.query(text, params)).rows;

  const handlers = {
    next: require('../api/next'), decide: require('../api/decide'),
    add: require('../api/add'), worker: require('../api/worker'),
  };

  async function call(name, { method = 'GET', query = {}, body, headers = {} } = {}) {
    const req = { method, query, body, headers };
    let out; const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(s) { out = JSON.parse(s); },
    };
    await handlers[name](req, res);
    return { code: res.statusCode, json: out };
  }
  const K = { k: 'test-user-key' };
  const W = { 'x-worker-key': 'test-worker-key' };
  let n = 0; const ok = (m) => console.log(`ok ${++n} ${m}`);

  // auth
  assert.equal((await call('next', { query: { k: 'wrong' } })).code, 403); ok('user routes reject a wrong key');
  assert.equal((await call('next', { query: {} })).code, 403); ok('user routes reject a missing key');
  assert.equal((await call('worker', { query: { action: 'approved' } })).code, 403); ok('worker routes reject no worker key');
  assert.equal((await call('worker', { query: { action: 'approved' }, headers: { 'x-worker-key': K.k } })).code, 403); ok('worker routes reject the user key');

  // worker ingest (idempotent)
  const items = [
    { ext_id: 'AAAAAAAAAAA', url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', title: 'Tucker Had Enough‼️🔥 #usa #israel', channel: 'Breezy Politics', published: '2026-10-10T00:00:00+00:00' },
    { ext_id: 'BBBBBBBBBBB', url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB', title: 'Second video', channel: 'Breezy Politics', published: '2026-10-09T00:00:00+00:00' },
  ];
  let r = await call('worker', { method: 'POST', headers: W, body: { action: 'ingest', items } });
  assert.equal(r.json.added, 2); ok('ingest adds new items');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'ingest', items } });
  assert.equal(r.json.added, 0); ok('ingest twice adds nothing');

  // page feed
  r = await call('next', { query: K });
  assert.equal(r.json.left, 2); assert.equal(r.json.items[0].ext_id, 'AAAAAAAAAAA');
  assert.equal(r.json.items[0].headline, 'Tucker Had Enough'); ok('feed is newest first; headline is cleaned');

  // add links
  r = await call('add', { method: 'POST', query: K, body: { url: 'https://x.com/someone/status/1234567890' } });
  assert.equal(r.json.result, 'added');
  r = await call('add', { method: 'POST', query: K, body: { url: 'https://x.com/someone/status/1234567890' } });
  assert.equal(r.json.result, 'already in the queue'); ok('X link added once');
  r = await call('add', { method: 'POST', query: K, body: { url: 'https://example.com' } });
  assert.equal(r.code, 400); ok('non-YouTube/X link rejected');

  // decide
  const feed = (await call('next', { query: K })).json.items;
  const yt = feed.find((i) => i.ext_id === 'AAAAAAAAAAA');
  const xi = feed.find((i) => i.source === 'x');
  r = await call('decide', { method: 'POST', query: K, body: { id: yt.id, decision: 'yes', headline: 'Edited headline', start: 12 } });
  assert.equal(r.json.status, 'approved'); ok('YouTube approve');
  r = await call('decide', { method: 'POST', query: K, body: { id: yt.id, decision: 'no' } });
  assert.equal(r.code, 409); ok('cannot decide twice');
  r = await call('decide', { method: 'POST', query: K, body: { id: xi.id, decision: 'yes' } });
  assert.equal(r.json.status, 'needs_manual'); ok('X approve routes to needs_manual, never download');
  r = await call('decide', { method: 'POST', query: K, body: { id: 999, decision: 'yes' } });
  assert.equal(r.code, 404); ok('unknown id 404');
  r = await call('decide', { method: 'POST', query: K, body: { id: yt.id, decision: 'maybe' } });
  assert.equal(r.code, 400); ok('bad decision 400');

  // worker reads and reports
  r = await call('worker', { query: { action: 'approved' }, headers: W });
  assert.equal(r.json.items.length, 1);
  assert.equal(r.json.items[0].headline, 'Edited headline'); assert.equal(r.json.items[0].start_sec, 12); ok('worker sees the approved item with edits');
  r = await call('worker', { query: { action: 'manual' }, headers: W });
  assert.equal(r.json.items.length, 1); ok('worker sees the X item to source by hand');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'mark', id: yt.id, status: 'rendered' } });
  assert.ok(r.json.ok);
  r = await call('worker', { query: { action: 'approved' }, headers: W });
  assert.equal(r.json.items.length, 0); ok('rendered items leave the worker queue');
  r = await call('next', { query: K });
  assert.equal(r.json.approved, 1); assert.equal(r.json.left, 1); ok('counts add up');

  console.log(`\nall ${n} checks passed`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
