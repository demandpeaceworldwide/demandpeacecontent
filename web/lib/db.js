// Postgres access. Production uses Neon (DATABASE_URL). Tests inject globalThis.__DP_QUERY__.
let neonSql;
let ready;

async function query(text, params = []) {
  if (globalThis.__DP_QUERY__) return globalThis.__DP_QUERY__(text, params);
  if (!neonSql) {
    const { neon } = require('@neondatabase/serverless');
    neonSql = neon(process.env.DATABASE_URL);
  }
  return neonSql.query(text, params);
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  source      TEXT NOT NULL,                 -- youtube | x
  ext_id      TEXT NOT NULL,                 -- video id or post url
  url         TEXT NOT NULL,
  title       TEXT,
  channel     TEXT,
  published   TEXT,
  thumb       TEXT,
  status      TEXT NOT NULL DEFAULT 'new',   -- new | approved | skipped | rendered | failed | needs_manual
  headline    TEXT,
  start_sec   INTEGER DEFAULT 0,
  note        TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ,
  UNIQUE (source, ext_id)
)`;

// Create the table on first use of each cold start (cheap, idempotent).
function ensure() {
  if (!ready) ready = query(SCHEMA).catch((e) => { ready = null; throw e; });
  return ready;
}

module.exports = { query, ensure };
