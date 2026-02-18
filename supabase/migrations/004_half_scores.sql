-- Migration 004: Allow half-score increments (0.5 steps from 1 to 5)
-- Changes score columns from SMALLINT to NUMERIC(2,1)

-- Drop existing CHECK constraints
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_technique_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_musicality_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_expression_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_timing_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_presentation_check;

-- Alter column types from SMALLINT to NUMERIC(2,1)
ALTER TABLE scores ALTER COLUMN technique TYPE NUMERIC(2,1);
ALTER TABLE scores ALTER COLUMN musicality TYPE NUMERIC(2,1);
ALTER TABLE scores ALTER COLUMN expression TYPE NUMERIC(2,1);
ALTER TABLE scores ALTER COLUMN timing TYPE NUMERIC(2,1);
ALTER TABLE scores ALTER COLUMN presentation TYPE NUMERIC(2,1);

-- Add new CHECK constraints allowing 0.5 increments (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)
ALTER TABLE scores ADD CONSTRAINT scores_technique_check
  CHECK (technique >= 1 AND technique <= 5 AND (technique * 2) = FLOOR(technique * 2));
ALTER TABLE scores ADD CONSTRAINT scores_musicality_check
  CHECK (musicality >= 1 AND musicality <= 5 AND (musicality * 2) = FLOOR(musicality * 2));
ALTER TABLE scores ADD CONSTRAINT scores_expression_check
  CHECK (expression >= 1 AND expression <= 5 AND (expression * 2) = FLOOR(expression * 2));
ALTER TABLE scores ADD CONSTRAINT scores_timing_check
  CHECK (timing >= 1 AND timing <= 5 AND (timing * 2) = FLOOR(timing * 2));
ALTER TABLE scores ADD CONSTRAINT scores_presentation_check
  CHECK (presentation >= 1 AND presentation <= 5 AND (presentation * 2) = FLOOR(presentation * 2));
