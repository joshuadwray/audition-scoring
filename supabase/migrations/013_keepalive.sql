-- Migration 013: Durable keepalive record so the Supabase 7-day pause can be prevented
-- AND verified.
--
-- The original keepalive (app/api/keepalive/route.ts) ran a read-only HEAD count and
-- left no trace, so there was no way to answer "is it actually running?" — Vercel Hobby
-- keeps no historical logs. The project paused anyway and nobody found out until a
-- session failed to start.
--
-- This table fixes the observability gap: every ping performs a real WRITE (unambiguous
-- database activity, unlike a read) and stamps one row PER SCHEDULER. Two schedulers
-- ping daily — Vercel Cron and GitHub Actions — so if one stalls, its row stops
-- incrementing and names the culprit. Inspect it any time in the Supabase Table Editor.
--
-- Bounded at one row per source (vercel / github / manual), so it never needs pruning.

CREATE TABLE IF NOT EXISTS keepalive (
  source       TEXT PRIMARY KEY,
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ping_count   BIGINT      NOT NULL DEFAULT 0
);

-- RLS: service_role only (only the keepalive API route touches this table)
ALTER TABLE keepalive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON keepalive;
CREATE POLICY "Service role only" ON keepalive
  FOR ALL USING (auth.role() = 'service_role');

-- Upsert + atomic increment in a single round trip. Returning the row lets the API
-- echo back last_ping_at/ping_count so callers (and the GitHub Actions job) can assert
-- the write really landed rather than trusting a bare 200.
-- RETURNS SETOF (not a bare composite) so PostgREST returns a one-element array, which
-- is what supabase-js .single() expects to unwrap.
CREATE OR REPLACE FUNCTION keepalive_ping(p_source TEXT)
RETURNS SETOF keepalive
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO keepalive (source, last_ping_at, ping_count)
  VALUES (p_source, NOW(), 1)
  ON CONFLICT (source) DO UPDATE
    SET last_ping_at = NOW(),
        ping_count   = keepalive.ping_count + 1
  RETURNING *;
$$;

-- Supabase normally reloads the PostgREST schema cache on DDL automatically. If the API
-- returns "Could not find the function public.keepalive_ping", run this to force it:
NOTIFY pgrst, 'reload schema';
