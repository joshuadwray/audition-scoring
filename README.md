# Dance Audition Scoring App

A real-time dance audition scoring system built for live audition settings. Admins organize dancers into groups, push groups to judges with a selected material (e.g. Jazz, Contemporary), and judges score independently on their own devices. Results aggregate automatically with Olympic averaging.

**Live at:** https://auditionscoring.vercel.app

## How It Works (User Flow)

1. **Admin creates a session** at `/admin/new` with a human-readable session code (e.g. `SPRING26`) and a 6-digit admin PIN.
2. **Admin sets up the session**: imports dancers (CSV or manual entry), creates materials (Jazz, Contemporary, etc.), creates judges (each gets a 4-digit PIN), and builds groups of dancers.
3. **Admin pushes a group** to judges by selecting a material. The same group can be pushed multiple times with different materials.
4. **Judges log in** on their own devices using the session code + their PIN. They receive pushed groups via Supabase Realtime.
5. **Judges score** each dancer across 5 categories (technique, musicality, expression, timing, presentation) on a 1-5 scale with 0.5 increments. Scores draft to localStorage for offline resilience.
6. **Judges submit** scores in a batch. Admin monitors progress in real time.
7. **Admin views results** with Olympic averages (drop high/low if 3+ judges), exports to CSV, and can lock the session to freeze all scores.

## Tech Stack

- **Next.js 15** (App Router) with **React 19** and **TypeScript**
- **Tailwind CSS** for styling
- **Supabase** for PostgreSQL database, Row Level Security, and Realtime subscriptions
- **Vercel** for deployment (auto-deploys from `main`)
- **jsonwebtoken** for PIN-based auth (no Supabase Auth, no user accounts)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables (copy from .env.example or ask for credentials)
# Required in .env.local:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   JWT_SECRET

# Run dev server
rm -rf .next && npm run dev
```

**Important dev notes:**
- Always `rm -rf .next` after code changes before testing (Next.js caches aggressively)
- Kill the dev server before running `npm run build` (they corrupt each other's `.next` directory)
- Node.js v24 is used on the dev machine

## Project Structure

```
app/                          # Next.js App Router pages and API routes
  page.tsx                    # Landing page (PIN + session code login)
  admin/
    new/page.tsx              # Create new session
    [sessionId]/page.tsx      # Admin dashboard (4 tabs: Setup, Monitor, Results, Judge)
  judge/
    [sessionId]/page.tsx      # Judge scoring interface
    [sessionId]/my-scores/    # Judge score review/editing
  api/                        # All backend logic (see API Routes below)

components/
  admin/                      # Admin-specific UI components
    DancerImport.tsx           # CSV upload + preview
    ManualDancerAdd.tsx        # Single dancer add form
    GroupBuilder.tsx            # Checkbox-based group creation
    AdHocGroupCreator.tsx      # Quick group creation from Monitor tab
    ProgressMonitor.tsx        # Real-time submission tracking
    ResultsTable.tsx           # Aggregated results + export
  judge/                      # Judge-specific UI components
    DancerTile.tsx             # Per-dancer scoring card (5 categories)
    CategoryScorer.tsx         # 1-5 button row for a single category
    GroupSubmitButton.tsx      # Validation + batch submit
    MyScoresView.tsx           # Score review (shared between judge + admin-as-judge)
  shared/                     # Shared components
    PINInput.tsx               # Digit-by-digit PIN entry
    SessionHeader.tsx          # Top bar with role + logout
    DancerPicker.tsx           # Searchable dancer selector

lib/
  database.types.ts            # TypeScript interfaces + constants
  material-colors.ts           # Color palette for material labels
  auth/
    session.ts                 # JWT creation/verification
    middleware.ts              # withAuth/withAdmin/withJudge route wrappers
  supabase/
    client.ts                  # Browser Supabase client (anon key)
    admin.ts                   # Server Supabase client (service role)
  realtime/
    admin-subscriptions.ts     # Admin subscribes to score submissions + group updates
    judge-subscriptions.ts     # Judge subscribes to group pushes + session lock status
  scoring/
    olympic-average.ts         # Score aggregation logic
    validation.ts              # Score range + completeness checks

supabase/
  migrations/                  # 7 sequential SQL migrations (001-007)
```

## API Routes

All mutations go through API routes using the Supabase service role client (RLS is configured as public reads, service-role-only writes).

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/validate-pin` | POST | Login (resolves session code to UUID) |
| `/api/sessions` | GET, POST | List / create sessions |
| `/api/sessions/[id]` | GET, PATCH, DELETE | Session CRUD |
| `/api/sessions/[id]/lock` | POST, DELETE | Lock / unlock session |
| `/api/dancers` | GET, POST, DELETE | Dancer CRUD + CSV bulk import |
| `/api/judges` | GET, POST, DELETE | Judge CRUD |
| `/api/groups` | GET, POST, DELETE | Group templates (DELETE = soft archive) |
| `/api/groups/[id]/push` | POST | Push group to judges with a material |
| `/api/groups/[id]/retract` | POST | Retract a pushed group |
| `/api/groups/[id]/complete` | POST | Mark group as complete |
| `/api/scores/submit` | POST | Batch score submission |
| `/api/scores/[id]` | GET, PATCH | View / edit individual scores |
| `/api/results/[sessionId]/export` | GET | CSV or JSON export |

## Key Concepts

### Authentication
PIN-based, no user accounts. Admin gets a 6-digit PIN, judges get 4-digit PINs. PINs are validated against the database and exchanged for JWTs stored in localStorage. The JWT contains `role`, `sessionId`, and optionally `judgeId`.

### Group Template/Instance Model
Groups are created as **templates** (no material assigned). When an admin pushes a group, a new **instance** is cloned from the template with a specific material. The same template can be pushed multiple times with different materials. Scores are linked to instances, so per-material results work naturally.

### Scoring
- 5 categories, each scored 1-5 in 0.5 increments
- Half-score toggle: tap a number to select it, tap again for +0.5
- Scores draft to localStorage, then batch-submit to the server
- **Olympic average**: drop highest and lowest judge scores (if 3+ judges), then average the rest

### Realtime
Supabase Realtime is used for two things:
- **Admin**: sees submission progress update live as judges submit
- **Judges**: receive new group pushes and session lock/unlock events without refreshing

### Admin-as-Judge
Admin can click "Join as Judge" to participate in scoring. This creates a real judge record flagged with `is_admin_judge=true` and adds a "Judge" tab to the admin dashboard.

## Database

8 tables in Supabase PostgreSQL: `sessions`, `materials`, `dancers`, `judges`, `dancer_groups`, `scores`, `score_submissions`, `admin_actions`.

Migrations are in `supabase/migrations/` and should be applied in order (001 through 007). The schema has evolved through:
1. Initial schema with full RLS
2. Session codes + admin-as-judge support
3. Rename teams -> materials
4. Half-score support (INTEGER -> NUMERIC)
5. Materials-to-groups model + dancer grade field
6. Group archiving (soft delete)
7. Group retraction (unpush)

## Deployment

- **GitHub**: Private repo, pushes via SSH
- **Vercel**: Auto-deploys from `main` branch
- Environment variables are configured in the Vercel dashboard

```bash
# Deploy
git add <files> && git commit -m "message" && git push origin main
```

## Development Tips

- Route handler params are **async** in Next.js 15: `const { id } = await params;`
- Supabase clients use a **lazy proxy pattern** to avoid build-time env var errors
- The judge scoring page and the admin Judge tab have **separate copies** of the scoring UI — changes to one must be mirrored to the other
- `MyScoresView` is a shared component used by both the judge my-scores page and the admin Judge tab
- `next.config.mjs` sets `outputFileTracingRoot` to fix a dual-lockfile build issue

## Docs

Additional documentation lives in `dance-audition-docs/`:
- `IMPLEMENTATION_PLAN.md` - Full technical spec
- `DESIGN_README.md` - Design rationale and product vision
- `dance-scoring-mockup.html` - Interactive HTML mockup (open in browser)
