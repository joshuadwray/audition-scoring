-- Migration 005: Move materials from dancers to groups, add grade field
-- Materials are now assigned at push time (group instances), not at dancer import.
-- dancer_material_assignments table is no longer needed.

-- Allow NULL material_id on dancer_groups (templates have NULL, instances have a material)
ALTER TABLE dancer_groups ALTER COLUMN material_id DROP NOT NULL;

-- Drop the old unique constraint that includes material_id
-- Constraint kept old name from before migration 003 rename
ALTER TABLE dancer_groups DROP CONSTRAINT IF EXISTS dancer_groups_session_id_team_id_group_number_key;
ALTER TABLE dancer_groups DROP CONSTRAINT IF EXISTS dancer_groups_session_id_material_id_group_number_key;

-- Add grade column to dancers
ALTER TABLE dancers ADD COLUMN grade INTEGER;

-- Drop the dancer_material_assignments table
DROP TABLE IF EXISTS dancer_material_assignments;
