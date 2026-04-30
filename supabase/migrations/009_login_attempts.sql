-- Migration 009: Login attempt tracking for rate limiting
--
-- Records every PIN validation attempt so the API can reject brute-force
-- requests without an external Redis/KV store.
-- Limits enforced in validate-pin/route.ts:
--   - Per IP per session_code: max 5 failures in 1 minute
--   - Per session_code globally: max 30 failures in 1 hour

CREATE TABLE IF NOT EXISTS login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  ip_address   TEXT NOT NULL,
  success      BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-IP-per-session lookups
CREATE INDEX IF NOT EXISTS login_attempts_ip_session_idx
  ON login_attempts (session_code, ip_address, attempted_at DESC);

-- Index for fast per-session global lookups
CREATE INDEX IF NOT EXISTS login_attempts_session_idx
  ON login_attempts (session_code, attempted_at DESC);

-- RLS: service_role only (only the API writes/reads this table)
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON login_attempts
  FOR ALL USING (auth.role() = 'service_role');
