-- Migration 011: Add encrypted-at-rest plaintext PIN copy alongside bcrypt hash
--
-- Why: admins need to retrieve judge PINs to distribute them shortly before
-- the event (the use case existed before migration 008 hashed them away).
-- This column stores an AES-256-GCM ciphertext of the plaintext PIN. The
-- bcrypt hash in judge_pin_hash remains the source of truth for login
-- verification; this column exists solely so an authenticated admin can
-- reveal the PIN via the new /api/judges/[id]/reveal-pin endpoint.
--
-- Format: base64(iv (12 bytes) || ciphertext || authTag (16 bytes))
-- Key:    PIN_ENCRYPTION_KEY env var (32-byte hex, 64 chars)
--
-- Nullable: judges created before this migration have no encrypted copy.
-- For those, admin must use the reset-pin endpoint to regenerate.

ALTER TABLE judge_secrets
  ADD COLUMN IF NOT EXISTS judge_pin_encrypted TEXT;
