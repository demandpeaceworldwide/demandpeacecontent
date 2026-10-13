# Demand Peace picks: hosted page (Vercel + Neon)

Noah's private page and its API. Node serverless functions, Postgres on Neon, one static HTML page.

```
public/index.html   the swipe page (works on a phone)
api/next.js         GET  next cards + counts                (needs ?k=<DP_KEY>)
api/decide.js       POST approve / skip, edit headline/start (needs ?k=)
api/add.js          POST add a YouTube or X link             (needs ?k=)
api/worker.js       worker endpoints for the Mac scripts     (needs header x-worker-key)
lib/                db (Neon), helpers
test/test.js        18 checks against in-memory Postgres:  npm test
test/devserver.js   local stand-in for Vercel, no accounts:  node test/devserver.js
```

## Tested (2026-10-11)

- `npm test`: all 18 checks pass (auth, ingest, idempotence, approve/skip, X never downloads, worker flow).
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
