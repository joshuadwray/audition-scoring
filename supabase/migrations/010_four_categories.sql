-- Migration 010: Reduce scoring categories from 5 to 4
-- Old: technique, musicality, expression, timing, presentation
-- New: performance_quality, technical_execution, musicality_timing, embodiment_of_style
--
-- WARNING: drops all existing scores and submissions. Confirmed by product owner —
-- only test data exists at the time this migration is applied.

-- Wipe all scores and submissions (parent rows referenced by FKs)
TRUNCATE TABLE scores, score_submissions RESTART IDENTITY CASCADE;

-- Reset any group instances that were marked completed by now-deleted submissions
UPDATE dancer_groups
SET status = 'active', completed_at = NULL
WHERE status = 'completed';

-- Drop existing CHECK constraints
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_technique_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_musicality_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_expression_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_timing_check;
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_presentation_check;

-- Drop old category columns
ALTER TABLE scores DROP COLUMN IF EXISTS technique;
ALTER TABLE scores DROP COLUMN IF EXISTS musicality;
ALTER TABLE scores DROP COLUMN IF EXISTS expression;
ALTER TABLE scores DROP COLUMN IF EXISTS timing;
ALTER TABLE scores DROP COLUMN IF EXISTS presentation;

-- Add new category columns (NOT NULL, NUMERIC(2,1), 0.5 increments 1-5)
ALTER TABLE scores ADD COLUMN performance_quality NUMERIC(2,1) NOT NULL;
ALTER TABLE scores ADD COLUMN technical_execution NUMERIC(2,1) NOT NULL;
ALTER TABLE scores ADD COLUMN musicality_timing NUMERIC(2,1) NOT NULL;
ALTER TABLE scores ADD COLUMN embodiment_of_style NUMERIC(2,1) NOT NULL;

-- CHECK constraints: 1-5 in 0.5 increments
ALTER TABLE scores ADD CONSTRAINT scores_performance_quality_check
  CHECK (performance_quality >= 1 AND performance_quality <= 5 AND (performance_quality * 2) = FLOOR(performance_quality * 2));
ALTER TABLE scores ADD CONSTRAINT scores_technical_execution_check
  CHECK (technical_execution >= 1 AND technical_execution <= 5 AND (technical_execution * 2) = FLOOR(technical_execution * 2));
ALTER TABLE scores ADD CONSTRAINT scores_musicality_timing_check
  CHECK (musicality_timing >= 1 AND musicality_timing <= 5 AND (musicality_timing * 2) = FLOOR(musicality_timing * 2));
ALTER TABLE scores ADD CONSTRAINT scores_embodiment_of_style_check
  CHECK (embodiment_of_style >= 1 AND embodiment_of_style <= 5 AND (embodiment_of_style * 2) = FLOOR(embodiment_of_style * 2));
