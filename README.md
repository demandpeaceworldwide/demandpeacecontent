# Demand Peace Content

Client content approval app. Review picks, edit headlines and clip start times, approve or skip items, and add YouTube or X links.

## Vercel setup

Import this repository and set **Root Directory** to `web`. Use the Other framework preset and the static `public` output directory. The API routes run as Node.js serverless functions.

Configure `DATABASE_URL` for Neon Postgres, `DP_KEY` for the approval link, and a separate `DP_WORKER_KEY` for the local video worker. Keep all secret values in environment variables.

See [web/README.md](web/README.md) for deployment and local test instructions.

Video fetching and rendering run separately on the operator's Mac. This repository contains only the web app; internal project records, brand artwork, and worker files remain in the local workspace.

## Review workflow

The content desk supports saved idea drafts, guarded undo, production/history views, finished-video and caption review, revision requests, and operator-reported scheduling/publication. Review decisions never publish automatically. See `web/README.md` for setup, worker protocol, verification, and video-hosting requirements.
