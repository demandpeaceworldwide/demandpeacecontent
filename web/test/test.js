// Runs the API handlers against an in-memory Postgres (PGlite). No network, no Neon account needed.
process.env.DP_REVIEW_ONLY = 'false';
process.env.DP_KEY = 'test-user-key';
process.env.DP_WORKER_KEY = 'test-worker-key';
const assert = require('assert');

(async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite();
  globalThis.__DP_QUERY__ = async (text, params) => (await pg.query(text, params)).rows;

  const handlers = {
    next: require('../api/next'), decide: require('../api/decide'),
    add: require('../api/add'), worker: require('../api/worker'), edit: require('../api/edit'), direction: require('../api/direction'),
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
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'claim', id: yt.id } });
  assert.equal(r.code, 200); ok('worker claims before rendering');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'mark', id: yt.id, status: 'rendered' } });
  assert.ok(r.json.ok);
  r = await call('worker', { query: { action: 'approved' }, headers: W });
  assert.equal(r.json.items.length, 0); ok('rendered items leave the worker queue');
  r = await call('next', { query: K });
  assert.equal(r.json.approved, 1); assert.equal(r.json.left, 1); ok('counts add up');

  // Draft persistence and optimistic concurrency.
  const fresh = (await call('next', { query: K })).json.items[0];
  r = await call('edit', { method: 'POST', query: K, body: { action: 'draft', id: fresh.id, version: fresh.version, headline: 'Saved draft', start: 90 } });
  assert.equal(r.code, 200);
  let version = r.json.version;
  const saved = (await call('next', { query: K })).json.items[0];
  assert.equal(saved.headline, 'Saved draft'); assert.equal(saved.start_sec, 90); ok('draft survives a feed reload');
  r = await call('edit', { method: 'POST', query: K, body: { action: 'draft', id: fresh.id, version: fresh.version, headline: 'Stale tab', start: 0 } });
  assert.equal(r.code, 409); ok('stale tab cannot overwrite a newer draft');
  const competing = await Promise.all(['yes','no'].map(decision => call('decide', { method: 'POST', query: K, body: { id: fresh.id, version, decision, headline: 'Saved draft', start: 90 } })));
  assert.deepEqual(competing.map(x => x.code).sort(), [200,409]); ok('simultaneous decisions have one winner');
  let production = (await call('next', { query: { ...K, view: 'production' } })).json;
  let item = production.items.find(i => i.id === fresh.id);
  if (!item) item = (await call('next', { query: { ...K, view: 'history' } })).json.items.find(i => i.id === fresh.id);
  r = await call('edit', { method: 'POST', query: K, body: { action: 'undo', id: item.id, version: item.version } });
  assert.equal(r.code, 200); ok('undo returns an unprocessed item to review');
  version = r.json.version;
  await call('decide', { method: 'POST', query: K, body: { id: item.id, version, decision: 'yes' } });
  item = (await call('next', { query: { ...K, view: 'production' } })).json.items.find(i => i.id === item.id);
  const claims = await Promise.all([1,2].map(() => call('worker', { method: 'POST', headers: W, body: { action: 'claim', id: item.id } })));
  assert.deepEqual(claims.map(x => x.code).sort(), [200,409]); ok('only one worker can claim an item');
  r = await call('edit', { method: 'POST', query: K, body: { action: 'undo', id: item.id, version: item.version } });
  assert.equal(r.code, 409); ok('undo is blocked after production begins');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'submit_review', id: yt.id, video_url: 'javascript:alert(1)' } });
  assert.equal(r.code, 400); ok('unsafe final preview URL rejected');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'submit_review', id: yt.id, video_url: 'https://media.example.com/reel.mp4', caption: 'Source: @creator' } });
  assert.equal(r.code, 200);
  item = (await call('next', { query: { ...K, view: 'final' } })).json.items[0];
  assert.equal(item.caption, 'Source: @creator'); ok('finished video enters final review');
  r = await call('edit', { method: 'POST', query: K, body: { action: 'request_changes', id: item.id, version: item.version, caption: item.caption, feedback: '' } });
  assert.equal(r.code, 400); ok('revision requires useful feedback');
  r = await call('edit', { method: 'POST', query: K, body: { action: 'request_changes', id: item.id, version: item.version, caption: item.caption, feedback: 'Please shorten the intro' } });
  assert.equal(r.code, 200);
  const revisions = (await call('worker', { headers: W, query: { action: 'revisions' } })).json.items;
  assert.equal(revisions[0].client_feedback, 'Please shorten the intro'); ok('revision feedback reaches the worker');
  await call('worker', { method: 'POST', headers: W, body: { action: 'claim', id: yt.id } });
  await call('worker', { method: 'POST', headers: W, body: { action: 'submit_review', id: yt.id, video_url: 'https://media.example.com/revised.mp4', caption: 'Updated source credit' } });
  item = (await call('next', { query: { ...K, view: 'final' } })).json.items[0];
  r = await call('edit', { method: 'POST', query: K, body: { action: 'approve_final', id: item.id, version: item.version, caption: 'Client-approved caption' } });
  assert.equal(r.code, 200);
  item = (await call('next', { query: { ...K, view: 'history' } })).json.items.find(i => i.id === yt.id);
  assert.equal(item.status, 'final_approved'); assert.equal(item.caption, 'Client-approved caption'); ok('final approval preserves edited caption without publishing');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'publish', id: item.id } });
  assert.equal(r.code, 409); ok('cannot publish before scheduling');
  await call('worker', { method: 'POST', headers: W, body: { action: 'schedule', id: item.id } });
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'publish', id: item.id } });
  assert.equal(r.code, 200);
  assert.equal((await call('next', { query: { ...K, view: 'published' } })).json.total, 1); ok('operator-reported scheduling and publication appear in status views');
  r = await call('edit', { method: 'POST', body: { action: 'undo', id: item.id, version: item.version } });
  assert.equal(r.code, 403); ok('new edit endpoint requires private key');
  await call('worker', { method: 'POST', headers: W, body: { action: 'mark', id: fresh.id, status: 'failed', note: 'PRIVATE OPERATOR ERROR' } });
  production = (await call('next', { query: { ...K, view: 'production' } })).json;
  assert.ok(!JSON.stringify(production).includes('PRIVATE OPERATOR ERROR')); ok('client views never expose operator error notes');
  r = await call('next', { query: { ...K, view: 'nope' } }); assert.equal(r.code, 400); ok('invalid status view rejected');
  r = await call('decide', { method: 'POST', query: K, body: { id: fresh.id, decision: 'yes', version: 'invalid' } });
  assert.equal(r.code, 400); ok('malformed versions rejected before database access');
  await call('worker', { method: 'POST', headers: W, body: { action: 'ingest', items: Array.from({length: 25}, (_, i) => ({ext_id: 'page-item-' + i, url: 'https://www.youtube.com/watch?v=page-item-' + i, title: 'Page item ' + i})) } });
  const page1 = (await call('next', { query: K })).json;
  const page2 = (await call('next', { query: { ...K, offset: '20' } })).json;
  assert.equal(page1.items.length, 20); assert.equal(page1.hasMore, true);
  assert.equal(page2.items.length, 5); assert.equal(page2.hasMore, false);
  assert.equal(new Set([...page1.items, ...page2.items].map(i => i.id)).size, 25); ok('history/feed pagination does not drop or duplicate items');
  const { mediaLink } = require('../lib/media');
  const driveId = 'exampleVideoFile12345';
  const drive = mediaLink('https://drive.google.com/file/d/' + driveId + '/view?usp=sharing&resourcekey=key-123');
  assert.equal(drive.provider, 'drive');
  assert.equal(drive.preview, 'https://drive.google.com/file/d/' + driveId + '/preview?resourcekey=key-123'); ok('Drive preview preserves resource key');
  assert.equal(mediaLink('https://drive.google.com/open?id=' + driveId).url, 'https://drive.google.com/file/d/' + driveId + '/view');
  assert.equal(mediaLink('https://drive.google.com/uc?id=' + driveId + '&export=download').provider, 'drive'); ok('legacy Drive file links normalize to review links');
  assert.equal(mediaLink('https://media.example.com/reel.mp4').provider, 'direct'); ok('existing direct videos remain supported');
  for (const link of ['https://drive.google.com/drive/folders/' + driveId, 'https://drive.google.com/file/d/bad/view', 'https://user:pass@drive.google.com/file/d/' + driveId + '/view', 'javascript:alert(1)']) assert.throws(() => mediaLink(link));
  ok('folder, malformed, credential-bearing, and unsafe links rejected');
  const rendered = production.items.find(i => i.id === fresh.id);
  await call('worker', { method: 'POST', headers: W, body: { action: 'claim', id: rendered.id } });
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'submit_review', id: rendered.id, video_url: 'https://drive.google.com/drive/folders/' + driveId } });
  assert.equal(r.code, 400); ok('worker rejects a Drive folder as a final video');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'submit_review', id: rendered.id, video_url: drive.url, caption: 'Drive-hosted final' } });
  assert.equal(r.code, 200);
  const driveItem = (await call('next', { query: { ...K, view: 'final' } })).json.items.find(i => i.id === rendered.id);
  assert.equal(driveItem.video_provider, 'drive'); assert.equal(driveItem.video_preview_url, drive.preview); ok('Drive video reaches final review with embed and fallback metadata');
  process.env.DP_REVIEW_ONLY = 'true';
  let review = (await call('next', { query: K })).json;
  assert.equal(review.reviewOnly, true); ok('review-only launch mode is explicit');
  const pick = review.items[0];
  r = await call('edit', { method: 'POST', query: K, body: { action: 'draft', id: pick.id, version: pick.version, headline: pick.headline, start: 0, direction_note: 'Prefer interviews with clear context' } });
  assert.equal(r.code, 200);
  r = await call('decide', { method: 'POST', query: K, body: { id: pick.id, version: r.json.version, decision: 'yes' } });
  assert.equal(r.json.status, 'selected');
  let selected = (await call('next', { query: { ...K, view: 'selected' } })).json.items.find(i => i.id === pick.id);
  assert.equal(selected.direction_note, 'Prefer interviews with clear context'); ok('keep saves the idea and its direction without starting production');
  r = await call('edit', { method: 'POST', query: K, body: { action: 'draft', id: selected.id, version: selected.version, headline: selected.headline, start: 0, direction_note: 'Updated shortlist note' } });
  assert.equal(r.code, 200); ok('selected idea notes can still be edited');
  r = await call('worker', { method: 'POST', headers: W, body: { action: 'claim', id: pick.id } });
  assert.equal(r.code, 409);
  assert.deepEqual((await call('worker', { headers: W, query: { action: 'approved' } })).json.items, []); ok('review-only mode blocks production workers');
  r = await call('next', { query: { ...K, view: 'final' } }); assert.equal(r.code, 400); ok('production views unavailable during direction gathering');
  r = await call('edit', { method: 'POST', query: K, body: { action: 'undo', id: pick.id, version: selected.version+1 } });
  assert.equal(r.code, 200);
  r = await call('decide', { method: 'POST', query: K, body: { id: pick.id, version: r.json.version, decision: 'no' } });
  assert.equal(r.json.status, 'skipped');
  const skipped = (await call('next', { query: { ...K, view: 'skipped' } })).json.items.find(i => i.id === pick.id);
  assert.equal(skipped.direction_note, 'Updated shortlist note'); ok('undo and skip preserve direction notes');
  const direction = (await call('direction', { query: K })).json.direction;
  r = await call('direction', { method: 'POST', query: K, body: { version: direction.version, topics: 'Peace and human stories', avoid: 'Graphic footage', creators: '@trusted', examples: 'https://youtu.be/example' } });
  assert.equal(r.code, 200);
  const loadedDirection = (await call('direction', { query: K })).json.direction;
  assert.equal(loadedDirection.topics, 'Peace and human stories'); assert.equal(loadedDirection.avoid, 'Graphic footage'); ok('project direction persists across reloads');
  r = await call('direction', { method: 'POST', query: K, body: { version: direction.version, topics: 'Stale tab' } });
  assert.equal(r.code, 409); ok('stale direction edits cannot overwrite client preferences');
  assert.equal((await call('direction', {})).code, 403); ok('project preferences require private link');
  r = await call('direction', { method: 'POST', query: K, body: { version: loadedDirection.version, topics: 'x'.repeat(2001) } });
  assert.equal(r.code, 400); ok('oversized direction fields rejected');
  console.log(`\nall ${n} checks passed`);
  await pg.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
