-- Migration: Add session_code to sessions and is_admin_judge to judges
-- Run this in Supabase SQL Editor

-- Add session_code column (human-readable codes for login)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_code TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(session_code);

-- Add is_admin_judge flag to judges table
ALTER TABLE judges ADD COLUMN IF NOT EXISTS is_admin_judge BOOLEAN DEFAULT false;
