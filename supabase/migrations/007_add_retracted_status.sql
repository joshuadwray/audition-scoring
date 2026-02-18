-- Migration 007: Add 'retracted' status to dancer_groups
-- Allows admin to retract a pushed group instance

-- Drop existing CHECK constraint on status and re-add with 'retracted'
ALTER TABLE dancer_groups DROP CONSTRAINT IF EXISTS dancer_groups_status_check;
ALTER TABLE dancer_groups ADD CONSTRAINT dancer_groups_status_check
  CHECK (status IN ('queued', 'active', 'completed', 'retracted'));
