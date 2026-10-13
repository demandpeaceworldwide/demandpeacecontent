# Demand Peace picks: hosted page (Vercel + Neon)

Noah's private page and its API. Node serverless functions, Postgres on Neon, one static HTML page.

```
public/index.html   the content desk (works on a phone)
api/next.js         GET  next cards + counts                (needs ?k=<DP_KEY>)
api/decide.js       POST approve / skip, edit headline/start (needs ?k=)
api/add.js          POST add a YouTube or X link             (needs ?k=)
api/worker.js       worker endpoints for the Mac scripts     (needs header x-worker-key)
lib/                db (Neon), helpers
test/test.js        37 checks against in-memory Postgres:  npm test
test/devserver.js   local stand-in for Vercel, no accounts:  node test/devserver.js
```

## Tested (2026-10-11)

- `npm test`: all 37 checks pass (auth, ingest, idempotence, approve/skip, X never downloads, worker flow).
- Local dev server + the Python worker end to end: `fetch.py` ingested 8 items, the page API served them, an approval reached `produce.py`.
- **Not tested:** a real Vercel deploy and a real Neon database (no accounts yet), and the YouTube oEmbed title lookup in `add.js` (network).

## Deploy (after the accounts exist; the assistant cannot create them)

1. GitHub (Noah's account): create a repo, push this folder (`web/` as the repo root, or the whole project with Root Directory set to `web`).
2. Vercel (signed in with that GitHub): Import the repo.
3. Add the Neon integration from the Vercel Marketplace (free tier). It sets `DATABASE_URL`. The table is created on first request.
4. Set two environment variables in Vercel (Production):
   - `DP_KEY`: Noah's access key. Generate: `openssl rand -base64 18 | tr -d '/+='`
   - `DP_WORKER_KEY`: a different value for the Mac worker.
5. Deploy. Noah's link is `https://<project>.vercel.app/?k=<DP_KEY>`.
6. On the Mac: `export DP_API=https://<project>.vercel.app DP_WORKER_KEY=<value>` then run `python3 pipeline/fetch.py` and `python3 pipeline/produce.py`.

## Before going live

- **Vercel plan:** the free Hobby tier is for non-commercial use as I understand its terms. This is paid client work: check the current terms, and get Noah's OK on Pro (about $20/mo) or pick a free commercial-friendly host.
- The `?k=` link is a shared secret, not a login. Anyone with the link can approve posts. Send it only to Noah; rotate `DP_KEY` if it leaks. The pages send `noindex` and no-referrer headers.

## Client review workflow (October 12, 2026)

- Phone-friendly status views: To review, In production, Final review, Scheduled, Published, and History.
- Headline/start-time drafts save to the database, with version checks to prevent stale tabs overwriting changes.
- Approve idea starts production; it never publishes automatically. Undo returns skipped or unclaimed approved ideas to review. Once claimed, an idea cannot be withdrawn.
- The worker must POST `{action: "claim", id}` before rendering. Only claimed items can be marked rendered/failed. This prevents two workers rendering the same idea.
- Rendered items stay in production until the operator uploads the finished MP4 and submits its HTTPS URL and caption with `{action: "submit_review", id, video_url, caption}` to `/api/worker`, using the worker key.
- Final review allows caption editing, final approval, or a revision request with feedback. Final approval moves the item to History as ready to schedule. Worker GET `?action=revisions` returns revision requests; claim a revision before submitting its replacement preview.
- After scheduling externally, the operator can report `{action: "schedule", id}`; after publishing externally, report `{action: "publish", id}`. These actions record status; they do not operate Instagram.
- Worker errors remain operator-only. Client views show a generic production issue rather than raw error details.

The hosting database adds columns automatically on first use, retaining existing items. Configure `DATABASE_URL`, `DP_KEY`, and `DP_WORKER_KEY` before launch.

### Verification

37 API/database checks cover draft persistence, concurrent decisions, worker claims, guarded undo, revisions, final approval, status transitions, and authorization. A mobile-width Chrome check verified draft persistence, failed-save recovery, approval/undo, final caption approval, invalid-link handling, and lack of horizontal overflow or uncaught script errors.

### Current limits

Video uploads/storage are not provisioned by this app. Use an appropriately protected video host and a URL usable by Noah's browser; do not attach confidential media using unrestricted public URLs. The app does not verify upload permissions or video playback availability. Draft autosave applies to idea headlines and clip starts; final caption/feedback edits save when Noah submits approval or requests changes. Moving away from edited final-review fields asks before discarding them. Worker claiming prevents duplicate renders, but interrupted jobs remain in production until the operator marks them failed. Clips are still a fixed 45 seconds; subtitles and the blue headline accent remain separate production tasks.
