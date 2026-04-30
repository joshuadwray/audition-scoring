-- Migration 008: Security hardening — PIN hashing + RLS tightening
--
-- Strategy: move plaintext PINs into separate tables (session_secrets,
-- judge_secrets) that have no public SELECT policy. Main sessions and judges
-- tables keep their public read access since they no longer contain secrets.
-- Existing PINs are hashed in-place using pgcrypto bcrypt before the plaintext
-- columns are dropped, so existing sessions remain usable after deploy.

-- Enable pgcrypto for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create secrets tables
CREATE TABLE IF NOT EXISTS session_secrets (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  admin_pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS judge_secrets (
  judge_id UUID PRIMARY KEY REFERENCES judges(id) ON DELETE CASCADE,
  judge_pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Migrate existing plaintext PINs → bcrypt hashes
-- Uses pgcrypto blowfish (bcrypt) with cost factor 10.
-- bcryptjs.compare() is compatible with these hashes (both use $2a$ format).
INSERT INTO session_secrets (session_id, admin_pin_hash)
SELECT id, crypt(admin_pin, gen_salt('bf', 10))
FROM sessions
WHERE admin_pin IS NOT NULL
ON CONFLICT (session_id) DO NOTHING;

INSERT INTO judge_secrets (judge_id, judge_pin_hash)
SELECT id, crypt(judge_pin, gen_salt('bf', 10))
FROM judges
WHERE judge_pin IS NOT NULL
ON CONFLICT (judge_id) DO NOTHING;

-- 3. Drop plaintext PIN columns from main tables
ALTER TABLE sessions DROP COLUMN IF EXISTS admin_pin;
ALTER TABLE judges DROP COLUMN IF EXISTS judge_pin;

-- 4. RLS for secrets tables — service_role only, no public access
ALTER TABLE session_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON session_secrets
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON judge_secrets
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Drop public read from admin_actions (audit log should not be public)
DROP POLICY IF EXISTS "Public read access" ON admin_actions;

-- Note: sessions, judges, dancers, materials, dancer_groups, scores,
-- score_submissions retain their public read policies because:
-- - They no longer contain any secret/credential data
-- - The client-side realtime subscriptions and Supabase client reads depend on them
-- - scores/score_submissions are read by judge MyScores UI and ResultsTable via anon key
