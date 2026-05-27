-- Migration 012: Allow judges to skip scoring a dancer without blocking submission
--
-- A skipped row stores NULL for every category and is_skipped=TRUE. The
-- existing column CHECK constraints (1-5 in 0.5 increments) still apply
-- to non-null values, and a new row-level constraint enforces the XOR:
-- either fully scored XOR fully skipped — never partial.
--
-- Scoring math in lib/scoring/olympic-average.ts already filters NULL
-- per-category, so skipped judges drop out of averages naturally.

-- 1. Add the skip flag (default FALSE keeps all existing rows valid)
ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Allow category columns to be NULL (only when is_skipped = TRUE)
ALTER TABLE scores ALTER COLUMN performance_quality DROP NOT NULL;
ALTER TABLE scores ALTER COLUMN technical_execution DROP NOT NULL;
ALTER TABLE scores ALTER COLUMN musicality_timing DROP NOT NULL;
ALTER TABLE scores ALTER COLUMN embodiment_of_style DROP NOT NULL;

-- 3. Row-level constraint: rows are valid only if fully scored XOR fully skipped.
--    Per-column range CHECKs from migration 010 keep applying when non-null
--    (NULL in a CHECK evaluates to unknown, which passes).
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_skip_xor_complete_check;
ALTER TABLE scores ADD CONSTRAINT scores_skip_xor_complete_check CHECK (
  (
    is_skipped = FALSE
    AND performance_quality   IS NOT NULL
    AND technical_execution   IS NOT NULL
    AND musicality_timing     IS NOT NULL
    AND embodiment_of_style   IS NOT NULL
  )
  OR (
    is_skipped = TRUE
    AND performance_quality   IS NULL
    AND technical_execution   IS NULL
    AND musicality_timing     IS NULL
    AND embodiment_of_style   IS NULL
  )
);
