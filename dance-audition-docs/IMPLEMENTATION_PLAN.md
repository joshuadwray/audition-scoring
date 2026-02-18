# Dance Audition Scoring App - Implementation Plan

## Executive Summary

A real-time dance audition scoring system built on **Next.js 14 + Supabase + Vercel**. Admins orchestrate scoring sessions by pushing groups of 5 dancers to judges, who score locally before batch submission. Olympic averaging (remove high/low) calculates final results. Judges can review and edit submitted scores until admin locks the session.

**Key Features:**
- PIN-based authentication (no account signup)
- Admin-controlled workflow (push groups to judges)
- Hybrid sync (batch submission, not per-click)
- Local-first scoring with localStorage drafts
- Realtime progress monitoring
- Judge score review/editing until session locked
- Olympic average calculation and CSV export

---

## 1. Database Schema

### Core Tables

```sql
-- Sessions (audition events)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'paused', 'completed')),
  is_locked BOOLEAN DEFAULT false,           -- Prevents judge edits after event
  admin_pin TEXT NOT NULL,                   -- 6-digit PIN for admin
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
  judge_pin TEXT NOT NULL,                   -- 4-digit PIN
  is_active BOOLEAN DEFAULT true,
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
```

### Indexes

```sql
CREATE INDEX idx_sessions_status ON sessions(status);
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
```

### RLS Policies

```sql
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

-- All tables: Public reads, service role writes
CREATE POLICY "Public read access" ON sessions FOR SELECT USING (true);
CREATE POLICY "Service role write access" ON sessions FOR ALL USING (auth.role() = 'service_role');

-- Repeat for all tables (teams, dancers, etc.)
-- This prevents clients from bypassing PIN validation via direct Supabase writes
```

**Rationale:** PIN validation happens server-side in API routes using service role client. All mutations go through API routes, preventing clients from bypassing authentication.

### Database Functions

```sql
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

  IF array_length(scores_array, 1) < 3 THEN
    -- Regular average if < 3 judges
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
```

---

## 2. Authentication Architecture

### PIN-Based Sessions

**No Supabase Auth users.** Instead, PIN validation returns a JWT token stored in localStorage.

**Admin Flow:**
1. Enter session ID + 6-digit admin PIN
2. API validates → returns admin JWT token
3. Token includes: `{ sessionId, role: 'admin' }`

**Judge Flow:**
1. Enter session ID + 4-digit judge PIN
2. API validates → returns judge JWT token
3. Token includes: `{ sessionId, role: 'judge', judgeId, judgeName }`

**API Route:** `POST /api/auth/validate-pin`

```typescript
// Request
{ sessionId: string, pin: string, role: 'admin' | 'judge' }

// Response (success)
{ success: true, token: string, sessionName: string, judgeName?: string }

// Response (failure)
{ success: false, error: 'Invalid PIN' }
```

**Middleware:** All API routes validate JWT before processing. Extract sessionId/judgeId from token.

---

## 3. File Structure

**Project Root:** `/Users/joshuawray/Documents/audition-scoring`

```
src/
├── app/
│   ├── page.tsx                          # Landing: PIN entry
│   ├── admin/
│   │   ├── [sessionId]/
│   │   │   ├── page.tsx                  # Dashboard (tabs: Setup, Monitor, Results)
│   │   │   ├── setup/page.tsx            # Add dancers, judges, create groups
│   │   │   ├── monitor/page.tsx          # Live progress tracking
│   │   │   └── results/page.tsx          # Olympic averages + export
│   │   └── new/page.tsx                  # Create new session
│   ├── judge/
│   │   └── [sessionId]/
│   │       ├── page.tsx                  # Active group scoring interface
│   │       └── my-scores/page.tsx        # View/edit submitted scores
│   └── api/
│       ├── auth/validate-pin/route.ts
│       ├── sessions/
│       │   ├── route.ts                  # GET (list), POST (create)
│       │   └── [id]/
│       │       ├── route.ts              # GET, PATCH, DELETE
│       │       └── lock/route.ts         # POST (lock session, prevent edits)
│       ├── dancers/route.ts
│       ├── judges/route.ts
│       ├── groups/
│       │   ├── route.ts
│       │   ├── [id]/push/route.ts        # Push group to judges
│       │   └── [id]/complete/route.ts
│       ├── scores/
│       │   ├── submit/route.ts           # Batch submit
│       │   └── [id]/route.ts             # PATCH (judge or admin edit)
│       └── results/[sessionId]/export/route.ts
│
├── components/
│   ├── admin/
│   │   ├── DancerImport.tsx              # CSV upload
│   │   ├── GroupBuilder.tsx              # Drag-drop group creation
│   │   ├── ProgressMonitor.tsx           # Realtime submission tracking
│   │   └── ResultsTable.tsx              # Olympic averages display
│   ├── judge/
│   │   ├── DancerTile.tsx                # Tile-based scoring UI
│   │   ├── CategoryScorer.tsx            # 1-5 button group
│   │   ├── GroupSubmitButton.tsx         # Validate + submit
│   │   └── MyScoresCard.tsx              # Previously submitted group card
│   └── shared/
│       ├── PINInput.tsx
│       └── SessionHeader.tsx
│
├── lib/
│   ├── auth/
│   │   ├── session.ts                    # localStorage helpers
│   │   └── middleware.ts                 # JWT validation
│   ├── supabase/
│   │   ├── client.ts                     # Browser client (anon key)
│   │   └── admin.ts                      # Server client (service role)
│   ├── realtime/
│   │   ├── admin-subscriptions.ts
│   │   └── judge-subscriptions.ts
│   ├── scoring/
│   │   ├── olympic-average.ts
│   │   └── validation.ts
│   └── database.types.ts
│
└── middleware.ts                         # Next.js route protection
```

---

## 4. Core Workflows

### Workflow 1: Admin Pushes Group

**Trigger:** Admin clicks "Push Group 1" button

**API:** `POST /api/groups/[id]/push`

**Steps:**
1. Validate admin token
2. Update `dancer_groups` SET `status='active'`, `pushed_at=NOW()`
3. Supabase Realtime broadcasts change to all judges in session
4. Judges' screens update: new group appears

**Realtime Subscription (Judge):**
```typescript
supabase
  .channel(`session:${sessionId}:groups`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'dancer_groups',
    filter: `session_id=eq.${sessionId}`
  }, (payload) => {
    if (payload.new.status === 'active') {
      loadActiveGroup();
    }
  })
  .subscribe();
```

### Workflow 2: Judge Submits Scores

**Trigger:** Judge clicks "Submit Scores" after reviewing

**API:** `POST /api/scores/submit`

**Request Body:**
```typescript
{
  groupId: string,
  judgeId: string,
  scores: [
    { dancerId: string, technique: 1-5, musicality: 1-5, ... },
    ...
  ]
}
```

**Steps:**
1. Validate judge token (judgeId matches token)
2. Validate session not locked (`sessions.is_locked = false`)
3. Validate all 5 categories scored for each dancer
4. Check for duplicate submission (`score_submissions` UNIQUE constraint)
5. Batch insert into `scores` table
6. Insert into `score_submissions`
7. Check if all judges submitted (using `get_group_completion_status` function)
8. If complete, update group status to 'completed'
9. Clear localStorage draft

**Realtime Broadcast (Admin):**
```typescript
// Admin subscribes to score_submissions
supabase
  .channel(`session:${sessionId}:submissions`)
  .on('postgres_changes', {
    event: 'INSERT',
    table: 'score_submissions',
    filter: `group_id=eq.${activeGroupId}`
  }, () => {
    refetchGroupStatus(); // Update progress bar
  })
  .subscribe();
```

### Workflow 3: Judge Views/Edits Submitted Scores

**Page:** `/judge/[sessionId]/my-scores`

**UI:**
- List all groups judge has submitted
- Each group shows: Group #, Team name, Submitted timestamp
- Click group → opens modal/page with all dancers and scores
- Scores displayed as tile layout (same as initial scoring)
- Scores editable if `sessions.is_locked = false`
- Save edits → `PATCH /api/scores/[id]`

**API:** `PATCH /api/scores/[id]`

**Steps:**
1. Validate judge token
2. Validate session not locked
3. Validate score belongs to this judge
4. Update single category: `UPDATE scores SET <category>=<value>, updated_at=NOW() WHERE id=<scoreId>`
5. Return updated score

**Edge Case:** If admin locked session, show read-only view with message: "Session locked. Contact admin to edit scores."

### Workflow 4: Admin Locks Session

**Trigger:** Admin clicks "Lock Session" at end of event

**API:** `POST /api/sessions/[id]/lock`

**Steps:**
1. Validate admin token
2. Update `sessions` SET `is_locked=true`, `status='completed'`
3. Log in `admin_actions` table
4. Broadcast lock status (optional realtime notification to judges)

**Effect:**
- Judges can no longer edit scores (API returns 403 Forbidden)
- "My Scores" page shows read-only view
- Preserves final database state for export

### Workflow 5: Admin Exports Results

**API:** `GET /api/results/[sessionId]/export?teamId=<optional>`

**Steps:**
1. Validate admin token
2. Query all dancers (optionally filtered by team)
3. For each dancer:
   - Get all scores from all judges
   - Calculate Olympic average per category (remove high/low if ≥3 judges)
   - Calculate total average (avg of 5 categories)
4. Generate CSV with columns:
   - Dancer #, Name, Technique Avg, Musicality Avg, Expression Avg, Timing Avg, Presentation Avg, Total Avg
5. Return CSV file

**CSV Format:**
```csv
Dancer #,Name,Technique,Musicality,Expression,Timing,Presentation,Total
12,Jane Doe,4.33,4.67,4.00,4.33,4.67,4.40
15,John Smith,3.67,4.00,3.67,4.33,4.00,3.93
```

---

## 5. Judge Scoring Interface

### Tile Layout (Responsive)

**3 Layouts from Mockup:**

1. **Landscape (Desktop):** 3-column grid
2. **Portrait Tablet:** 2-column grid (abbreviated labels)
3. **Portrait Mobile:** 1-column (full labels)

**Tailwind Grid:**
```typescript
<div className="grid gap-4 p-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {dancers.map(dancer => (
    <DancerTile ... />
  ))}
</div>
```

### DancerTile Component

**Props:**
```typescript
interface DancerTileProps {
  dancer: { id: string; dancer_number: number; name: string };
  scores: ScoreState; // { technique?: 1-5, musicality?: 1-5, ... }
  onScoreChange: (category: string, value: number) => void;
  isLocked?: boolean; // If true, show read-only
}
```

**Border Colors:**
- Green: 5/5 categories scored (complete)
- Orange: 1-4/5 categories scored (in progress)
- Gray: 0/5 categories scored (not started)

**Progress Indicator:**
- Display "3/5" or "5/5 ✓"

### Local State Management

**Judge Page State:**
```typescript
const [localScores, setLocalScores] = useState<Record<string, ScoreState>>({});
const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
```

**Auto-save Draft to localStorage:**
```typescript
useEffect(() => {
  if (!activeGroupId || !judgeId) return;
  const draftKey = `scoring_draft_${activeGroupId}_${judgeId}`;
  localStorage.setItem(draftKey, JSON.stringify(localScores));
}, [localScores, activeGroupId, judgeId]);
```

**Load Draft on Mount:**
```typescript
useEffect(() => {
  if (!activeGroupId || !judgeId) return;
  const draftKey = `scoring_draft_${activeGroupId}_${judgeId}`;
  const draft = localStorage.getItem(draftKey);
  if (draft) setLocalScores(JSON.parse(draft));
}, [activeGroupId, judgeId]);
```

**Submit Handler:**
```typescript
const handleSubmit = async () => {
  // Validate all dancers fully scored
  const incomplete = dancers.filter(d => {
    const scores = localScores[d.id] || {};
    return Object.values(scores).filter(Boolean).length < 5;
  });

  if (incomplete.length > 0) {
    alert('Please score all categories for all dancers');
    return;
  }

  // Submit to API
  const response = await fetch('/api/scores/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      groupId: activeGroupId,
      judgeId,
      scores: dancers.map(d => ({ dancerId: d.id, ...localScores[d.id] }))
    })
  });

  if (response.ok) {
    localStorage.removeItem(`scoring_draft_${activeGroupId}_${judgeId}`);
    setLocalScores({});
    alert('Scores submitted!');
  }
};
```

---

## 6. Admin Dashboard

### Tab Navigation

**3 Tabs:**
1. **Setup:** Add dancers, judges, create groups
2. **Monitor:** Live progress tracking, push groups
3. **Results:** Olympic averages, export CSV

### Setup Tab

**Features:**
- **Dancer Import:** CSV upload (columns: Dancer #, Name, Team Names)
- **Judge Management:** Add judges with auto-generated PINs
- **Team Creation:** Create teams for session
- **Group Builder:** Drag dancers into groups of 5, assign to team

**CSV Upload Format:**
```csv
Dancer #,Name,Teams
12,Jane Doe,Varsity|JV
15,John Smith,Varsity
```

### Monitor Tab

**Features:**
- **Active Group:** Shows currently pushed group
- **Progress Bar:** "3/5 judges submitted" with realtime updates
- **Group Queue:** List of queued groups with "Push" button
- **Completion Status:** Auto-mark group complete when all judges submit

**Realtime Subscription:**
```typescript
supabase
  .channel(`session:${sessionId}:submissions`)
  .on('postgres_changes', {
    event: 'INSERT',
    table: 'score_submissions'
  }, () => {
    refetchGroupStatus();
  })
  .subscribe();
```

### Results Tab

**Features:**
- **Filter by Team:** Dropdown to filter dancers
- **Results Table:** Sortable columns (Dancer #, Name, Category Averages, Total)
- **Export CSV:** Download button
- **Score Editing:** Click cell to edit individual score (admin correction)
- **Lock Session:** Big red button to prevent further judge edits

**Olympic Average Display:**
```typescript
// Show warning if < 3 judges
{judgeCount < 3 && (
  <span className="text-yellow-600 text-xs">⚠ Regular avg (< 3 judges)</span>
)}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up Supabase project
- [ ] Run database migrations (schema + RLS + functions)
- [ ] Implement PIN auth API (`/api/auth/validate-pin`)
- [ ] Build session management utils (`lib/auth/session.ts`)
- [ ] Create landing page (PIN entry)
- [ ] Build admin session creation (`/admin/new`)

**Testing:** Create session, login as admin, login as judge

### Phase 2: Admin Setup (Week 2)
- [ ] Dancer bulk import (CSV upload)
- [ ] Judge management (add/remove, auto-generate PINs)
- [ ] Team creation and dancer-team assignments
- [ ] Group builder UI (drag-drop)
- [ ] API routes for dancers, judges, teams, groups

**Testing:** Import 50 dancers, create 3 teams, build 10 groups

### Phase 3: Judge Scoring Interface (Week 2-3)
- [ ] Judge dashboard (`/judge/[sessionId]`)
- [ ] Realtime subscription to new groups
- [ ] Tile layout (3 responsive variants)
- [ ] Local state + localStorage drafts
- [ ] Batch submit with validation
- [ ] Offline detection

**Testing:** Judge receives pushed group, scores 5 dancers, submits

### Phase 4: Judge "My Scores" Page (Week 3)
- [ ] List all submitted groups (`/judge/[sessionId]/my-scores`)
- [ ] View scores for each group
- [ ] Edit scores (if session not locked)
- [ ] API validation for locked sessions
- [ ] Show read-only view when locked

**Testing:** Judge submits group, views in My Scores, edits a score, admin locks session, judge sees read-only

### Phase 5: Admin Monitoring (Week 3)
- [ ] Group push mechanism (`/api/groups/[id]/push`)
- [ ] Progress monitor with realtime subscriptions
- [ ] View submitted scores
- [ ] Admin score editing
- [ ] Lock session functionality

**Testing:** Admin pushes group, sees realtime progress, edits score, locks session

### Phase 6: Results & Export (Week 4)
- [ ] Olympic average calculation (client + server)
- [ ] Results table (sortable, filterable)
- [ ] CSV export with raw scores + averages
- [ ] Admin actions audit log

**Testing:** Export CSV, verify Olympic averages correct

### Phase 7: Polish (Week 4-5)
- [ ] Handle < 3 judges (regular average fallback)
- [ ] Prevent duplicate submissions
- [ ] Handle groups with < 5 dancers
- [ ] Responsive design testing (3 layouts)
- [ ] Loading states, error boundaries
- [ ] Toast notifications for realtime events

**Testing:** End-to-end simulation with 3 judges, 30 dancers, 6 groups

---

## 8. Critical Files (Implementation Priority)

**All files relative to:** `/Users/joshuawray/Documents/audition-scoring`

### 1. `supabase/migrations/001_audition_schema.sql`
Database foundation. All tables, indexes, RLS policies, functions.

### 2. `src/lib/auth/session.ts`
PIN validation, JWT token management, localStorage helpers.

### 3. `src/app/api/scores/submit/route.ts`
Batch score submission. Validates, inserts, checks completion.

### 4. `src/app/judge/[sessionId]/page.tsx`
Judge scoring interface. Tile layout, local state, realtime subscriptions.

### 5. `src/app/judge/[sessionId]/my-scores/page.tsx`
Judge score review/editing. Validates session lock status.

### 6. `src/components/admin/ProgressMonitor.tsx`
Realtime progress tracking. Demonstrates Supabase Realtime integration.

### 7. `src/app/api/sessions/[id]/lock/route.ts`
Lock session to prevent edits. Critical for preserving final results.

---

## 9. Edge Cases & Solutions

### 1. Judge Loses Connection Before Submit
- **Solution:** localStorage draft restored on reconnect
- Show banner: "You have unsaved scores. Resume scoring?"

### 2. Admin Pushes New Group Before Judge Finished Previous
- **Solution:** Don't auto-clear judge screen
- Show notification: "New group available. Finish current group first."
- After submit, auto-load new group

### 3. < 3 Judges Score a Dancer
- **Solution:** Fallback to regular average
- Show warning in results: "⚠ Regular average (< 3 judges)"

### 4. Duplicate Submission Attempt
- **Solution:** UNIQUE constraint prevents DB duplicate
- Disable submit button after click
- API returns 409 Conflict

### 5. Judge Tries to Edit After Session Locked
- **Solution:** API validates `is_locked = false` before allowing updates
- Show read-only view in My Scores page
- Display message: "Session locked. Contact admin to edit."

### 6. Dancer Auditions for Multiple Teams
- **Solution:** `dancer_team_assignments` many-to-many table
- Results export can filter by team

### 7. Group with < 5 Dancers
- **Solution:** `dancer_ids` array accepts any length
- UI dynamically renders N tiles
- Validation: "All dancers in group scored" (not hardcoded to 5)

---

## 10. Testing Strategy

### Unit Tests
- Olympic average calculation (2, 3, 5, 10 scores)
- PIN validation logic
- Score validation (all categories 1-5)
- CSV generation

### Integration Tests
- Admin creates session → Judge logs in
- Admin pushes group → Judge receives via Realtime
- Judge submits → Admin sees progress update
- Judge edits score → Admin sees updated result
- Admin locks session → Judge cannot edit

### End-to-End Scenario
**Setup:** 1 admin, 3 judges, 15 dancers, 3 teams, 3 groups

**Flow:**
1. Admin creates session, imports 15 dancers
2. Admin adds 3 judges (auto-generated PINs)
3. Admin creates 3 teams, assigns 5 dancers each
4. Admin creates 3 groups (5 dancers per group)
5. Judges 1-3 log in
6. Admin pushes Group 1
7. All 3 judges score 5 dancers
8. All 3 judges submit
9. Judge 1 edits a score in My Scores
10. Admin sees 3/3 complete
11. Admin locks session
12. Judge 1 tries to edit (blocked)
13. Admin exports CSV

**Expected:**
- Realtime updates < 1s
- No duplicate submissions
- Olympic averages correct (high/low removed)
- CSV downloads successfully
- Judge edits blocked after lock

---

## 11. Deployment

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
```

### Supabase Setup
- Enable Realtime for `dancer_groups`, `score_submissions` tables
- Verify RLS policies active
- Create indexes on all foreign keys
- Set up hourly database backups during event

### Vercel Setup
- Deploy to production
- Set environment variables
- Test on judge devices (iPads, tablets)

### Pre-Event Checklist
- Run full E2E test 24 hours before
- Test realtime on all devices
- Print judge PINs on cards
- Export backup results every hour during event

---

## Verification

**How to test end-to-end:**

1. **Create session:** Admin creates "Spring 2026 Auditions" with admin PIN
2. **Import dancers:** Upload CSV with 15 dancers
3. **Add judges:** Create 3 judges with auto-generated PINs
4. **Create groups:** Build 3 groups of 5 dancers each
5. **Judge login:** All 3 judges enter session ID + PINs
6. **Push group:** Admin pushes Group 1 → all judges see dancers appear
7. **Score dancers:** Judges score all 5 dancers across 5 categories
8. **Submit scores:** All judges click "Submit Scores"
9. **View progress:** Admin sees "3/3 judges submitted" in real-time
10. **Edit score:** Judge 1 goes to My Scores, edits one category
11. **Lock session:** Admin clicks "Lock Session"
12. **Verify lock:** Judge 1 cannot edit scores in My Scores (read-only)
13. **Export CSV:** Admin downloads results, verify Olympic averages match manual calculation

**Success criteria:**
- All realtime updates received < 1 second
- No duplicate submissions
- Olympic averages calculated correctly (high/low removed for ≥3 judges)
- Judges can edit until session locked
- CSV downloads with all data
