-- Dance Audition Scoring App - Database Schema
-- Run this migration in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions (audition events)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_code TEXT UNIQUE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'paused', 'completed')),
  is_locked BOOLEAN DEFAULT false,
  admin_pin TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams (competitive teams dancers audition for)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dancers
CREATE TABLE dancers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  dancer_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, dancer_number)
);

-- Dancer-team assignments (many-to-many)
CREATE TABLE dancer_team_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dancer_id UUID NOT NULL REFERENCES dancers(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dancer_id, team_id)
);

-- Judges
CREATE TABLE judges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  judge_pin TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_admin_judge BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, judge_pin)
);

-- Dancer groups (groups of ~5 pushed to judges)
CREATE TABLE dancer_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  group_number INTEGER NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'active', 'completed')),
  dancer_ids UUID[] NOT NULL,
  pushed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, team_id, group_number)
);

-- Scores (individual judge scores per dancer)
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES dancer_groups(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  dancer_id UUID NOT NULL REFERENCES dancers(id) ON DELETE CASCADE,
  technique SMALLINT CHECK (technique >= 1 AND technique <= 5),
  musicality SMALLINT CHECK (musicality >= 1 AND musicality <= 5),
  expression SMALLINT CHECK (expression >= 1 AND expression <= 5),
  timing SMALLINT CHECK (timing >= 1 AND timing <= 5),
  presentation SMALLINT CHECK (presentation >= 1 AND presentation <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, judge_id, dancer_id)
);

-- Score submissions (track when judge completes group)
CREATE TABLE score_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES dancer_groups(id) ON DELETE CASCADE,
  judge_id UUID NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  score_count INTEGER NOT NULL,
  UNIQUE(group_id, judge_id)
);

-- Admin actions audit log
CREATE TABLE admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_code ON sessions(session_code);
CREATE INDEX idx_teams_session ON teams(session_id);
CREATE INDEX idx_dancers_session ON dancers(session_id);
CREATE INDEX idx_dancers_number ON dancers(dancer_number);
CREATE INDEX idx_dancer_team_assignments_dancer ON dancer_team_assignments(dancer_id);
CREATE INDEX idx_dancer_team_assignments_team ON dancer_team_assignments(team_id);
CREATE INDEX idx_judges_session ON judges(session_id);
CREATE INDEX idx_judges_pin ON judges(session_id, judge_pin);
CREATE INDEX idx_groups_session ON dancer_groups(session_id);
CREATE INDEX idx_groups_team ON dancer_groups(team_id);
CREATE INDEX idx_groups_status ON dancer_groups(status);
CREATE INDEX idx_scores_group ON scores(group_id);
CREATE INDEX idx_scores_judge ON scores(judge_id);
CREATE INDEX idx_scores_dancer ON scores(dancer_id);
CREATE INDEX idx_submissions_group ON score_submissions(group_id);
CREATE INDEX idx_submissions_judge ON score_submissions(judge_id);
CREATE INDEX idx_groups_dancer_ids ON dancer_groups USING GIN (dancer_ids);

-- Enable RLS on all tables
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE dancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dancer_team_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE dancer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Public reads, service role writes
CREATE POLICY "Public read access" ON sessions FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON sessions FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON teams FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON teams FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON dancers FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON dancers FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON dancer_team_assignments FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON dancer_team_assignments FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON judges FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON judges FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON dancer_groups FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON dancer_groups FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON scores FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON scores FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON score_submissions FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON score_submissions FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Public read access" ON admin_actions FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON admin_actions FOR ALL USING (auth.role() = 'service_role');

-- Database Functions

-- Calculate Olympic average for a dancer's scores in one category
CREATE OR REPLACE FUNCTION calculate_olympic_average(
  p_dancer_id UUID,
  p_category TEXT
) RETURNS DECIMAL(4,2) AS $$
DECLARE
  scores_array DECIMAL[];
  trimmed_scores DECIMAL[];
BEGIN
  EXECUTE format('SELECT ARRAY_AGG(%I) FROM scores WHERE dancer_id = $1', p_category)
  INTO scores_array USING p_dancer_id;

  IF scores_array IS NULL OR array_length(scores_array, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  IF array_length(scores_array, 1) < 3 THEN
    RETURN (SELECT AVG(val) FROM UNNEST(scores_array) val);
  END IF;

  -- Remove highest and lowest
  SELECT ARRAY_AGG(val) INTO trimmed_scores
  FROM (
    SELECT val FROM UNNEST(scores_array) val
    ORDER BY val OFFSET 1
    LIMIT array_length(scores_array, 1) - 2
  ) trimmed;

  RETURN (SELECT AVG(val) FROM UNNEST(trimmed_scores) val);
END;
$$ LANGUAGE plpgsql;

-- Get group completion status (how many judges submitted)
CREATE OR REPLACE FUNCTION get_group_completion_status(p_group_id UUID)
RETURNS TABLE (
  total_judges INTEGER,
  completed_judges INTEGER,
  is_complete BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT j.id)::INTEGER,
    COUNT(DISTINCT ss.judge_id)::INTEGER,
    COUNT(DISTINCT j.id) = COUNT(DISTINCT ss.judge_id)
  FROM dancer_groups dg
  JOIN judges j ON j.session_id = dg.session_id AND j.is_active = true
  LEFT JOIN score_submissions ss ON ss.group_id = dg.id
  WHERE dg.id = p_group_id
  GROUP BY dg.id;
END;
$$ LANGUAGE plpgsql;

-- Enable Realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE dancer_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE score_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
