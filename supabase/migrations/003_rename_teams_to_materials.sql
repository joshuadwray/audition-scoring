-- Migration 003: Rename "teams" to "materials"
-- This renames the teams table, dancer_team_assignments table,
-- and all related columns, indexes, constraints, and RLS policies.

-- Step 1: Rename tables
ALTER TABLE teams RENAME TO materials;
ALTER TABLE dancer_team_assignments RENAME TO dancer_material_assignments;

-- Step 2: Rename columns
ALTER TABLE dancer_material_assignments RENAME COLUMN team_id TO material_id;
ALTER TABLE dancer_groups RENAME COLUMN team_id TO material_id;

-- Step 3: Rename indexes (if they exist)
-- The original migration creates indexes with team-based names
ALTER INDEX IF EXISTS idx_teams_session RENAME TO idx_materials_session;
ALTER INDEX IF EXISTS idx_dancer_team_assignments_dancer RENAME TO idx_dancer_material_assignments_dancer;
ALTER INDEX IF EXISTS idx_dancer_team_assignments_team RENAME TO idx_dancer_material_assignments_material;
ALTER INDEX IF EXISTS idx_dancer_groups_team RENAME TO idx_dancer_groups_material;

-- Step 4: Rename unique constraints (if named)
-- The unique constraint on teams(session_id, name) needs renaming
ALTER INDEX IF EXISTS teams_session_id_name_key RENAME TO materials_session_id_name_key;
ALTER INDEX IF EXISTS dancer_team_assignments_dancer_id_team_id_key RENAME TO dancer_material_assignments_dancer_id_material_id_key;

-- Step 5: Rename RLS policies
-- Drop old policies and recreate with new names on renamed tables
DO $$
BEGIN
  -- materials (formerly teams)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'materials' AND policyname = 'teams_public_read') THEN
    DROP POLICY teams_public_read ON materials;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'materials' AND policyname = 'teams_service_write') THEN
    DROP POLICY teams_service_write ON materials;
  END IF;

  -- dancer_material_assignments (formerly dancer_team_assignments)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dancer_material_assignments' AND policyname = 'dancer_team_assignments_public_read') THEN
    DROP POLICY dancer_team_assignments_public_read ON dancer_material_assignments;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dancer_material_assignments' AND policyname = 'dancer_team_assignments_service_write') THEN
    DROP POLICY dancer_team_assignments_service_write ON dancer_material_assignments;
  END IF;
END $$;

-- Recreate RLS policies with new names
CREATE POLICY materials_public_read ON materials FOR SELECT USING (true);
CREATE POLICY materials_service_write ON materials FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY dancer_material_assignments_public_read ON dancer_material_assignments FOR SELECT USING (true);
CREATE POLICY dancer_material_assignments_service_write ON dancer_material_assignments FOR ALL USING (auth.role() = 'service_role');
