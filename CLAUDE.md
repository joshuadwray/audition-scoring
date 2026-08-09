# Dance Audition Scoring App - Claude Context

## Project Status: FULLY BUILT, DEPLOYED, IN TESTING
Live at https://auditionscoring.vercel.app (auto-deploys from `main`).
All 7 implementation phases complete + 4 admin portal updates + materials-to-groups migration + QoL updates (group archive, monitor dancer names, tile name/running total) + Group A polish (retract/unpush, ad-hoc auto-push) + Group B polish (clearer group names, material label colors) + #8 keyboard navigation. Build passes cleanly. Supabase connected and verified.
End-to-end smoke test passed (session creation, PIN auth, session deletion).

## Tech Stack
- **Next.js 15.5.15** (App Router, TypeScript, Tailwind CSS) - `package.json` declares `^15.5.7`; the lockfile resolves to 15.5.15 and `@next/swc-darwin-arm64` 15.5.15 exists, so the old "downgrade to 15.5.7 because 15.5.8+ has no swc package" workaround no longer applies
- **React 19** (came with Next.js 15 upgrade)
- **Supabase** (PostgreSQL, Realtime, RLS) - project: ordsabaankrmhppsvsqp
- **Vercel** (deployment target)
- **jsonwebtoken** for PIN-based auth (no Supabase Auth)
- **Node.js v24** on dev machine

## Key Architecture Decisions
- PIN-based auth (admin=6-digit, judge=4-digit) -> JWT tokens in localStorage
- All mutations go through API routes using Supabase service role client (not anon client)
- RLS: public reads, service_role writes only
- Batch score submission (not per-click sync)
- localStorage drafts for offline resilience
- Supabase Realtime for admin progress monitoring and judge group push notifications
- Supabase clients use lazy proxy pattern to avoid build-time env var errors
- **Runtime Supabase config fallback**: `app/layout.tsx` injects `window.__SUPABASE_CONFIG__` via a server-rendered script tag, and `lib/supabase/client.ts` falls back to it when build-time `NEXT_PUBLIC_*` vars are missing. This ensures client-side Supabase reads work even if env vars weren't inlined during the Vercel build step.
- **Session codes**: Human-readable codes (e.g. "SPRING26") used for login instead of UUIDs. UUID remains internal PK.
- **Admin judging**: Admin can opt-in as a judge via "Join as Judge" button. Creates a real judge record with `is_admin_judge=true`. `requireJudge` auth accepts admin tokens with `judgeId`.
- **Group template/instance model**: Groups are created as reusable templates (no material). When pushed, a new instance row is created with the selected material. Same template can be pushed multiple times with different materials.

## Database Tables (12 total)
sessions, materials, dancers, judges, dancer_groups, scores, score_submissions, admin_actions, session_secrets, judge_secrets, login_attempts, keepalive

## Database Columns Added (migration 002)
- `sessions.session_code` — TEXT UNIQUE, human-readable login code (stored uppercase)
- `judges.is_admin_judge` — BOOLEAN DEFAULT false, flags admin's judge record

## Database Renames (migration 003)
- `teams` → `materials`
- `dancer_team_assignments` → `dancer_material_assignments`
- `team_id` → `material_id` in `dancer_material_assignments` and `dancer_groups`

## Database Score Type Change (migration 004)
- Score columns changed from `SMALLINT` to `NUMERIC(2,1)` to support half-score increments
- CHECK constraints enforce 0.5 steps: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5
- **Migration file:** `supabase/migrations/004_half_scores.sql` (must be applied to Supabase)

## Database Materials-to-Groups + Grade (migration 005)
- `dancer_groups.material_id` changed to NULLABLE (templates have NULL, instances have a material)
- Unique constraint `dancer_groups_session_id_team_id_group_number_key` DROPPED (allows same group_number with different materials). Note: constraint kept old `team_id` name from before migration 003 rename.
- `dancers.grade` INTEGER column added (optional)
- `dancer_material_assignments` table DROPPED (materials now assigned at push time via group instances)
- **Migration file:** `supabase/migrations/005_materials_to_groups_and_grade.sql` (must be applied to Supabase)

## Database Group Archive (migration 006)
- `dancer_groups.is_archived` — BOOLEAN DEFAULT false, soft delete for groups
- Archiving a template also archives all its instances (same `group_number` + `session_id`)
- Scores and submissions are preserved in database
- **Migration file:** `supabase/migrations/006_group_archive.sql` (must be applied to Supabase)

## Database Retracted Status (migration 007)
- `dancer_groups.status` — supports 'retracted' value for unpushed group instances
- Retracted instances are hidden from judge view, scores optionally deleted
- **Migration file:** `supabase/migrations/007_add_retracted_status.sql` (must be applied to Supabase)

## Database Four Categories (migration 010)
- Old 5 columns dropped: `technique`, `musicality`, `expression`, `timing`, `presentation`
- New 4 columns: `performance_quality`, `technical_execution`, `musicality_timing`, `embodiment_of_style` (NUMERIC(2,1) NOT NULL, 0.5 increments 1-5)
- Migration TRUNCATEs `scores` + `score_submissions` and resets any `dancer_groups.status='completed'` instances back to 'active' (orphaned by score wipe)
- **Migration file:** `supabase/migrations/010_four_categories.sql` (must be applied to Supabase). Destroys all existing scores — confirmed safe at migration time.

## Database Encrypted PIN Storage (migration 011)
- `judge_secrets.judge_pin_encrypted` — TEXT, nullable, AES-256-GCM ciphertext (base64-encoded `iv || ciphertext || authTag`)
- Coexists with `judge_pin_hash` (bcrypt) — hash is still source of truth for login; encrypted copy exists only so admins can reveal PINs to redistribute them
- Encryption key from `PIN_ENCRYPTION_KEY` env var (32-byte hex). DB leak alone is useless; attacker also needs the env var
- Judges created before this migration have NULL `judge_pin_encrypted` — reveal endpoint returns 410 + `legacy: true`, admin UI offers Reset PIN instead
- **Migration file:** `supabase/migrations/011_judge_pin_encrypted.sql` (must be applied to Supabase)

## Database Skip Dancer (migration 012)
- `scores.is_skipped` — BOOLEAN NOT NULL DEFAULT FALSE
- 4 category columns made NULLABLE (only nullable when `is_skipped=true`)
- New CHECK constraint `scores_skip_xor_complete_check`: row is valid only if fully scored XOR fully skipped — partial rows rejected at DB level
- Scoring math in `lib/scoring/olympic-average.ts` filters skipped rows from both per-judge totals and the effective judge count (so Olympic-vs-simple threshold uses only judges who actually scored)
- Submit endpoint accepts `is_skipped: true` per dancer; PATCH accepts skip toggle (un-skipping requires all categories in same request)
- **Migration file:** `supabase/migrations/012_skip_dancer.sql` (must be applied to Supabase)

## Database Keepalive (migration 013)
- `keepalive` table — `source` TEXT PK (`vercel` | `github` | `manual`), `last_ping_at` TIMESTAMPTZ, `ping_count` BIGINT. One row per scheduler.
- `keepalive_ping(p_source TEXT)` SQL function — upsert + atomic increment in one round trip, returns the row
- RLS: service_role only (same pattern as `login_attempts`)
- Exists so the pause-prevention ping is a **write** (unambiguous DB activity) and leaves a **durable, free-to-inspect trail** — Vercel Hobby keeps no historical logs, so this table is the only way to verify the keepalive is running
- **Migration file:** `supabase/migrations/013_keepalive.sql` (must be applied to Supabase)

## Group Template/Instance Model
- **Template** (`material_id = NULL`): Created in Setup tab, reusable. Contains group_number and dancer_ids.
- **Instance** (`material_id` set): Created at push time by cloning template. Linked to scores.
- Same template can be pushed multiple times with different materials (e.g. Group 1 with Jazz, then Group 1 with Contemporary).
- Scores link to instance rows, so per-material results work as before.
- Setup tab shows only templates. Monitor tab shows templates with inline material push dropdown and collapsible instance history.

## Scoring Categories (4)
performance_quality, technical_execution, musicality_timing, embodiment_of_style (each 1-5 in 0.5 increments, NUMERIC(2,1)). Total score range: 4-20. `MAX_TOTAL_SCORE` constant exported from `lib/database.types.ts` (= `SCORE_CATEGORIES.length * 5`). Most code iterates `SCORE_CATEGORIES`, so future category-count changes only require touching the constants in `lib/database.types.ts` plus the migration.

## Two User Roles (+ Admin-as-Judge)
- **Admin**: Create sessions (with session code), import dancers (with grade), manage judges/materials, build groups (no material), archive groups (soft delete), push groups (with material), monitor progress, view results, export CSV, lock/unlock sessions, delete dancers, join as judge
- **Judge**: Login via PIN + session code, receive pushed groups via realtime, score dancers locally, batch submit, view/edit submitted scores (until session locked)
- **Admin-as-Judge**: Admin clicks "Join as Judge" → gets a judge record, JWT re-issued with `judgeId`, "Judge" tab appears on admin dashboard with full scoring UI

## File Structure (no src/ prefix)
```
app/
  page.tsx                              # Landing: PIN entry (uses session code)
  layout.tsx                            # Root layout (Inter font)
  globals.css                           # Tailwind base
  admin/
    new/page.tsx                        # Create new session (with session code field)
    [sessionId]/page.tsx                # Dashboard (4 tabs: Setup, Monitor, Results, Judge*)
  judge/
    [sessionId]/page.tsx                # Active group scoring interface
    [sessionId]/my-scores/page.tsx      # View/edit submitted scores
  api/
    auth/validate-pin/route.ts          # Resolves session by UUID or session_code
    sessions/route.ts                   # GET (list), POST (create with sessionCode)
    sessions/[id]/route.ts             # GET (supports UUID or session_code lookup), PATCH, DELETE
    sessions/[id]/lock/route.ts        # POST (lock), DELETE (unlock)
    dancers/route.ts                    # GET, POST (bulk CSV + single + _createMaterial), DELETE (with force option)
    judges/route.ts                     # GET, POST (supports isAdminJudge flag, writes hash + encrypted PIN), DELETE
    judges/[id]/pin/route.ts            # PATCH (judge self-PIN-change, writes hash + encrypted)
    judges/[id]/reveal-pin/route.ts     # POST (admin-only PIN reveal; audit-logged; 30/min/session throttle; 410 if legacy)
    judges/[id]/reset-pin/route.ts      # POST (admin regenerates judge PIN, returns plaintext once)
    groups/route.ts                     # GET, POST (materialId optional — null = template), DELETE (soft archive)
    groups/[id]/push/route.ts          # POST (clones template as instance with materialId)
    groups/[id]/retract/route.ts       # POST (sets instance status to 'retracted', optionally deletes scores)
    groups/[id]/complete/route.ts      # POST
    scores/submit/route.ts             # POST (batch submit)
    scores/[id]/route.ts              # GET, PATCH (edit)
    results/[sessionId]/export/route.ts # GET (CSV or JSON)
    keepalive/route.ts                  # GET (Supabase pause-prevention ping; CRON_SECRET-gated; writes keepalive table)
components/
  admin/
    DancerImport.tsx                    # CSV upload + preview (format: Dancer #, Name, Grade)
    ManualDancerAdd.tsx                # Single dancer add form (number, name, grade)
    GroupBuilder.tsx                    # Checkbox-based group creation (no material selection)
    AdHocGroupCreator.tsx              # Collapsible ad-hoc group creation (Monitor tab) with DancerPicker
    ProgressMonitor.tsx                # Template/instance layout with inline material push + submission tracking + dancer names
    ResultsTable.tsx                   # Aggregated results with expandable per-material rows + sortable + export + lock/unlock
  judge/
    DancerTile.tsx                     # Tile-based scoring UI (bold name always visible, running total bar, optional materialLabel prop)
    CategoryScorer.tsx                 # 1-5 button group per category (tap toggles half-scores: 3→3.5→3)
    GroupSubmitButton.tsx              # Validate + submit bar
    MyScoresCard.tsx                   # Submitted group card (legacy, unused by new My Scores)
    MyScoresView.tsx                   # Shared My Scores component (used by judge page + admin Judge tab)
  shared/
    PINInput.tsx                       # Individual digit PIN entry
    SessionHeader.tsx                  # Header bar with role + logout
    DancerPicker.tsx                   # Searchable dancer selection widget (search + checkbox list + grade/group display)
lib/
  database.types.ts                    # All TypeScript interfaces + constants
  auth/
    session.ts                         # JWT create/verify, token extraction helpers, requireJudge accepts admin+judgeId
    middleware.ts                      # withAuth/withAdmin/withJudge wrappers
  supabase/
    client.ts                          # Browser client (anon key, lazy proxy)
    admin.ts                           # Server client (service role, lazy proxy)
  realtime/
    admin-subscriptions.ts             # Subscribe to submissions + group updates
    judge-subscriptions.ts             # Subscribe to group changes + session status
  scoring/
    olympic-average.ts                 # Olympic avg, simple avg, DancerResult, AggregatedDancerResult, MaterialResult
    validation.ts                      # Score completeness + range validation
  crypto/
    pin-encryption.ts                  # AES-256-GCM encrypt/decrypt for judge_pin_encrypted (PIN_ENCRYPTION_KEY env)
supabase/
  migrations/001_audition_schema.sql   # Full schema, indexes, RLS, functions, realtime
  migrations/002_session_codes_and_admin_judge.sql  # session_code + is_admin_judge columns
  migrations/003_rename_teams_to_materials.sql  # Rename teams → materials
  migrations/004_half_scores.sql               # SMALLINT → NUMERIC(2,1) for 0.5 increments
  migrations/005_materials_to_groups_and_grade.sql  # Materials to groups, add grade, drop dancer_material_assignments
  migrations/006_group_archive.sql                  # Add is_archived to dancer_groups for soft delete
  migrations/007_add_retracted_status.sql            # Add 'retracted' status for group instances (unpush)
  migrations/010_four_categories.sql                 # Drop 5 old categories, add 4 new ones (truncates scores)
  migrations/011_judge_pin_encrypted.sql              # Add judge_pin_encrypted column (AES-GCM ciphertext) for admin PIN reveal
  migrations/012_skip_dancer.sql                       # Add is_skipped + make categories nullable; XOR CHECK constraint
  migrations/013_keepalive.sql                          # keepalive table + keepalive_ping() RPC for pause prevention
.github/
  workflows/keepalive.yml              # Second, independent daily keepalive ping (backs up Vercel Cron)
vercel.json                            # Vercel Cron schedule for /api/keepalive
```

## Next.js 15 Notes
- Route handler params are async: `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params;`
- Supabase clients use lazy proxy pattern to avoid build-time env var errors
- React 19 is used (came with Next.js 15 upgrade)
- @next/swc-darwin-arm64 must match the next version exactly (currently both 15.5.15 via the lockfile). The old ceiling of 15.5.7 no longer holds — swc packages are published for current releases
- `next.config.mjs` sets `outputFileTracingRoot: __dirname` to fix dual-lockfile issue (parent `~/package-lock.json` exists); without this, `.next/server/` fails to build

## Scoring Logic (Results Tab + Export)
- **Per-material level**: Category columns use **simple averages** across judges (no dropping). "Total Score" = simple average of per-judge sums (each judge's 5 categories summed, range 5-25). "Olympic Average" = olympic average of per-judge total scores.
- **Aggregated top-level row** (All Materials view): Category columns = **sum** of that category's average across all materials. Total Score = **sum** of per-material Total Scores. Olympic Average = **independent calculation**: for each judge, sum their total scores across all materials → one value per judge → olympic average those.
- Only **Olympic Average** column is bold in the UI (both top-level and material sub-rows).
- Clicking a dancer row in All Materials view expands to show per-material detail sub-rows (only if dancer has multiple materials).
- Material filter dropdown shows single-material view (flat rows, no expansion, no aggregation).
- **Single-material dancer set**: Derived from `dancer_groups` rows with that `material_id` (not from dancer_material_assignments, which was dropped).
- Key interfaces: `DancerResult` (per-material), `AggregatedDancerResult` (cross-material with `materialResults: MaterialResult[]`)
- Key functions: `calculateSimpleAverage()`, `calculateDancerResults()` (per-material), `calculateAggregatedResults()` (cross-material)
- CSV export includes per-material detail rows (indented) when dancer has multiple materials; `materialId` query param exports single-material only

## Critical Implementation Notes
- Olympic average: drop highest + lowest score if >= 3 judges, else regular average
- Groups use UUID[] array for dancer_ids (variable group size, not hardcoded to 5)
- Score submissions tracked separately from scores (score_submissions table)
- Session locking prevents all judge edits (API validates is_locked before writes); unlock sets status back to 'active'
- CSV format: `Dancer #, Name, Grade (optional)` for import; export: Dancer #, Name, 5 category averages, Total Score, Olympic Average
- Duplicate submission prevented by UNIQUE(group_id, judge_id) on score_submissions + API 409 response
- Single dancer POST accepts `{ session_id, dancer_number, name, grade }` — returns 409 on duplicate dancer_number
- Material creation POST accepts `{ _createMaterial: true, sessionId, materialName }` via `/api/dancers` (uses service role; browser anon client cannot write due to RLS)
- Admin status bar shows session_code (click-to-copy) instead of truncated UUID
- AdHocGroupCreator (Monitor tab) loads its own data, auto-numbers groups based on templates only
- Delete dancer API checks for scores; returns 409 with `hasScores: true` without `force=true`; with force, deletes scores and removes dancer from group arrays
- Session code stored uppercase, validated as alphanumeric + hyphens, 3-20 chars
- Login flow resolves session_code → UUID at auth time; all internal routing uses UUIDs
- Admin-judge POST to `/api/judges` with `isAdminJudge: true` returns a new admin JWT with `judgeId` included
- `requireJudge` accepts tokens where `role === 'admin'` AND `judgeId` is present
- Judge tab on admin dashboard reuses `DancerTile`, `CategoryScorer`, `GroupSubmitButton` components with realtime group subscriptions
- **IMPORTANT**: Any changes to the judge scoring page (`app/judge/[sessionId]/page.tsx`) must also be applied to the admin dashboard's Judge tab (`app/admin/[sessionId]/page.tsx`), which has its own copy of the grid layout, group query, and tile rendering
- **My Scores**: Shared `MyScoresView` component (`components/judge/MyScoresView.tsx`) is used by both the judge my-scores page and the admin Judge tab's "My Scores" sub-tab. Features: flat dancer list sorted by name, search bar, expandable rows with horizontal material tiles, explicit "Save Changes" button with dirty state tracking. DancerTile accepts optional `materialLabel` prop to show material badge in tile header.
- **Admin Judge tab sub-tabs**: Judge tab has "Score" and "My Scores" sub-tabs (`judgeSubTab` state). Score sub-tab is the active group scoring UI, My Scores sub-tab renders `MyScoresView`.
- **Judge my-scores auth**: `app/judge/[sessionId]/my-scores/page.tsx` accepts both `role=judge` and `role=admin` (with `admin_judge_id` in localStorage) for admin-as-judge access.
- Half-score toggle: tap a number button to select whole score, tap again for +0.5 (light blue), tap again to return to whole. Button 5 does not toggle to 5.5. Validation uses shared `isValidScore()` from `lib/scoring/validation.ts`
- Judge tile grid is responsive: 1-col mobile, 2-col md (768px), 4-col lg (1024px), 5-col xl (1280px). Compact mode activates at lg (1024px+) — shows full category labels, smaller padding/font
- Group headers show material name: "Group N - MaterialName" (via Supabase join `*, materials(name)` using `DancerGroupWithMaterial` type)
- `DancerGroupWithMaterial` interface in `lib/database.types.ts` extends `DancerGroup` with optional `materials` join
- **Push API** (`/api/groups/[id]/push`): Requires `{ materialId }` in body. Clones template as new instance with that material. Returns the instance row.
- **GroupBuilder**: No material selection — creates templates only
- **ProgressMonitor**: Shows template rows with inline material dropdown + Push button. Collapsible push history shows instances with progress bars.
- **DancerPicker**: Simplified — search + checkbox list with grade and group number display. No material filter pills.
- **ManualDancerAdd**: Grade input field, no material pills.
- **Setup tab groups list**: Only shows templates (filters out instances and archived groups). Archive button (box icon) on hover; confirms before archiving.
- **Group archive**: DELETE `/api/groups?groupId=...` sets `is_archived=true` on template + all instances with same group_number/session_id. Scores preserved. Archived groups hidden from Setup, Monitor, and status bar count.
- **Monitor dancer names**: ProgressMonitor fetches dancers and displays comma-separated `#N Name` under each template header.
- **DancerTile name**: Dancer name is always shown in bold next to the number (including compact mode). Previously hidden in compact/materialLabel modes.
- **DancerTile running total**: Full-width colored bar below header shows running score total out of 25. Blue while in-progress, green when complete. Hidden when no categories scored.
- **Retract API** (`/api/groups/[id]/retract`): Sets instance status to 'retracted'. Optionally deletes associated scores. ProgressMonitor shows Retract button on active instances with two-step confirmation. Judge realtime subscription detects retraction, clears active group, shows banner.
- **AdHocGroupCreator auto-push**: Creates template then immediately pushes with selected material in one flow. Button reads "Create & Push Group N". Material selection is required before create.
- **Keyboard navigation**: Forms (landing, new session, manual dancer add) submit on Enter. Judge scoring tiles support arrow keys (Left/Right = tile, Up/Down = category) + number keys 1-5 (set score, auto-advance; tap same number twice = half-score toggle, no advance) + **S key (toggle skip on focused tile)**. Escape clears focus. Keyboard inactive when typing in inputs. State: `focusedTileIndex`, `focusedCategoryIndex`. DancerTile props: `isFocused`, `focusedCategoryIndex`, `onFocusTile`, `onToggleSkip`. CategoryScorer prop: `isFocused`. Both judge page and admin Judge tab have identical keyboard handlers.
- **Skip dancer**: Judges can skip scoring an individual dancer via a "Skip" pill in the tile header (or the S key). Skipped tiles dim, hide the category scorers, and count as "complete" for submission gating. Tap "Unskip" to restore the scorers. Skipped rows submit with `is_skipped=true` and NULL categories; scoring math excludes them from both per-judge totals and the effective judge count for the Olympic-vs-simple threshold. Editable from My Scores too.

## Environment Variables
`.env.local` is configured and working locally. Vercel env vars are configured in the Vercel dashboard.
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY — **Must be the correct anon/public key from Supabase dashboard** (Settings → API). An incorrect key causes all client-side reads to silently fail ("Invalid API key") while server-side API routes still work.
- SUPABASE_SERVICE_ROLE_KEY
- JWT_SECRET (random 32-byte hex)
- PIN_ENCRYPTION_KEY (random 32-byte hex, 64 chars) — AES-256-GCM key for encrypting judge PINs at rest; required for admin PIN reveal/reset endpoints. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Must also be set on Vercel for production reveals to work.
- CRON_SECRET (random 32-byte hex) — shared secret for `/api/keepalive`. **Required in production**: the route fails closed (500) without it, rather than silently becoming a public service-role endpoint. Must be set in **two** places with the same value: Vercel env vars, and as a GitHub repository secret (Settings → Secrets and variables → Actions) for the backup workflow.

**Important**: `NEXT_PUBLIC_*` vars are inlined into the client JS bundle at build time. After changing them on Vercel, you must **redeploy** (not just restart). The runtime fallback in `layout.tsx` provides a safety net but the correct keys must still be set.

## Supabase Pause Prevention
Supabase pauses free-tier projects after **7 days of inactivity**. This app is used seasonally, so the off-season is one long inactivity window. It paused once in Aug 2026 despite an earlier keepalive, because that keepalive pinged only every 3 days (two missed runs = 9 days), read instead of wrote, and left no record — Vercel Hobby keeps no historical logs, so there was no way to tell it had stopped.

**Current setup — two independent daily schedulers:**
| Scheduler | Config | Time | `source` |
|---|---|---|---|
| Vercel Cron (primary) | `vercel.json` | 12:00 UTC | `vercel` |
| GitHub Actions (backup) | `.github/workflows/keepalive.yml` | 00:00 UTC | `github` |

Both call `GET /api/keepalive` with `Authorization: Bearer $CRON_SECRET`. The route calls `keepalive_ping()`, which **writes** to the `keepalive` table. Daily × 2 sources means six consecutive failures of *both* are needed before a pause.

Source attribution: an explicit `?source=` wins (GitHub Actions sets it); otherwise a `vercel-cron` user-agent is recorded as `vercel`; anything else is `manual`. `vercel.json`'s cron `path` deliberately carries **no query string** — Vercel validates that field and a rejected value would fail the deploy.

**How to verify it's working:** open the `keepalive` table in the Supabase Table Editor. Both rows should show a `last_ping_at` within the last day and a steadily climbing `ping_count`. A row that has stopped incrementing names the broken scheduler.

**Alerting:** the GitHub Actions job asserts `"ok":true` in the response body (a 200 alone isn't proof the DB write landed) and fails otherwise; GitHub emails on workflow failure by default. This is the only failure alerting — Vercel Cron failures are still silent.

**Gotchas:**
- GitHub disables scheduled workflows after 60 days of **repo inactivity** (warning email first). Any push resets the clock.
- Both pings route through the Vercel deployment, so a broken deploy stops both — but the GH Actions job will fail loudly.
- Vercel Hobby allows 2 crons/project, once per day max. Daily is already the ceiling.
- If Supabase does pause, the keepalive can't un-pause it — restore manually from the Supabase dashboard.
- Long-term fix if downtime ever becomes costly: Supabase Pro (~$25/mo) never auto-pauses.

## Known Limitations / Future Polish
- No offline detection banner (drafts save to localStorage but no explicit "offline" UI)
- Notifications use text banners, not toast popups
- Error handling uses alerts, not error boundary components
- No loading skeleton states
- Admin can't click-to-edit scores in the results table (API supports it, UI is read-only)
- Group builder uses checkboxes, not drag-and-drop
- @next/swc version mismatch will corrupt `.next` at runtime — versions MUST match (currently both 15.5.15). Install from the lockfile (`npm ci` / plain `npm install`) rather than bumping `next` alone

## Open Polish Items
1. **Restrict "New Session" page access** — Currently `/admin/new` is open; should require admin auth or similar gate
2. ~~**Unpush a group**~~ — **DONE**: Retract API at `/api/groups/[id]/retract`, ProgressMonitor has Retract button with two-step confirmation, judge realtime handles retraction. Migration `007_add_retracted_status.sql`.
3. ~~**Clearer names on group list**~~ — **DONE**: Setup tab group list now shows `#N Name` under each group header (matching ProgressMonitor pattern). Uses `dancerMap` via `useMemo`.
4. ~~**Material-specific label colors**~~ — **DONE**: 8-color palette in `lib/material-colors.ts` (blue, purple, green, orange, pink, teal, indigo, yellow). Applied at: Setup material pills, ProgressMonitor instance labels, DancerTile (`materialColorClasses` prop), MyScoresView badges + tiles, ResultsTable sub-row labels. Same material = same color everywhere.
5. **"Join as Judge" button not showing immediately** — Bug: the opt-in button doesn't appear right away when configuring a new session; may require a state refresh or navigation
6. ~~**Ad-hoc group auto-push**~~ — **DONE**: AdHocGroupCreator creates template + immediately pushes with selected material. Button reads "Create & Push Group N".
7. **Judge realtime push (untested)** — Realtime subscriptions exist (`subscribeToGroupChanges`) so pushes should appear without page refresh. Still unverified, but no longer blocked: the app is deployed, so multi-device testing is now possible.
8. ~~**Keyboard navigation**~~ — **DONE**: Enter/Return submits forms (landing, new session, manual dancer add). Judge scoring supports arrow key tile/category navigation + number key scoring with auto-advance. Focus state shown via blue ring on tile + blue highlight on category. Works on both judge page and admin Judge tab.
9. ~~**Deploy to Vercel**~~ — **DONE**: live at https://auditionscoring.vercel.app, auto-deploying from `main`. Supabase pause prevention is in place (see "Supabase Pause Prevention"). #7 is now unblocked.

### Suggested Work Order
- ~~**Group A (#2 + #6)**~~: **DONE** — Push lifecycle (unpush + ad-hoc auto-push) implemented. Test #7 (realtime) as follow-up.
- ~~**Group B (#3 + #4)**~~: **DONE** — Clearer group names + material-specific label colors. New utility: `lib/material-colors.ts`.
- **Group C (#1 + #5)**: Admin setup flow — restrict new session page + fix Join as Judge button timing. Shared code: admin routing, auth, dashboard initial state.
- **#7**: Test realtime push delivery to judges. Unblocked now that #9 is done — needs two devices against the live deployment.
- ~~**#8**~~: **DONE** — Keyboard navigation (Enter-to-submit + arrow/number key scoring).
- ~~**#9**~~: **DONE** — Deployed to Vercel; multi-device testing for #7 is now possible.

## Post-Change Requirement
After making code changes, **always delete the `.next` cache** before the user tests:
```bash
rm -rf .next
```
Next.js caches aggressively and stale cache causes runtime errors after code changes. The dev server will rebuild automatically on next request. If the dev server is running and `rm` hangs, stop the server first.

**Also:** Running `npm run build` while the dev server is running will corrupt the `.next` directory. Always kill the dev server before building, or clear `.next` and restart the dev server afterward. Use `pkill -f "next dev"` to ensure all next processes are dead before clearing.

## Common Commands
```bash
rm -rf .next && npm run dev   # Clear cache + start dev server (preferred)
npm run dev                   # Start dev server (localhost:3000)
npm run build                 # Build for production (also clears stale cache)
npm run lint                  # Run linter
```

## Documentation Location
- `dance-audition-docs/IMPLEMENTATION_PLAN.md` - Full technical spec (primary reference)
- `dance-audition-docs/DESIGN_README.md` - Design rationale
- `dance-audition-docs/README.md` - Project overview and setup steps
- `dance-audition-docs/dance-scoring-mockup.html` - Interactive HTML mockup (3 layouts)

## Testing Checklist
1. Create session (admin/new) with session code (e.g. SPRING26) -> note code + PIN
2. Login as admin using session code -> Setup tab: add materials (Jazz, Contemporary), import CSV (`1, Alice, 10` / `2, Bob, 11`) or add dancers manually with grade, add judges
3. Verify grade displays as gray pill next to dancer name in Setup tab
4. Create Group 1 (select dancers, no material selection) in Setup tab
5. Verify group appears in Setup groups list without material info
6. Delete a dancer (hover for trash icon); test force-delete on dancer with scores
7. Activate session
8. Switch to Monitor tab — see Group 1 template with material dropdown
9. Push Group 1 with Jazz (select material, click Push) → push history expands showing Jazz instance
10. Open second browser, login as judge with session code + judge PIN
11. Score all dancers, submit
12. Admin monitor should update in realtime (progress bar under Jazz instance)
13. Push Group 1 again with Contemporary → judge receives new group
14. Score and submit as judge
15. Admin: Results tab — verify per-material breakdown (Jazz vs Contemporary sub-rows)
16. Admin: Export CSV — verify both materials in output
17. Judge: go to My Scores, edit a score
18. Admin: Lock session -> judge should see read-only
19. Admin: Unlock session -> verify judges can edit again
20. Admin: Click "Join as Judge" -> Judge tab appears, score dancers, submit, verify in results
21. Judge: My Scores — flat dancer list sorted by name, search works, expand dancer to see material tiles side-by-side, edit scores, Save Changes button appears and persists
22. Admin: Judge tab → "My Scores" sub-tab shows same My Scores UI with admin-judge scores
23. Lock session → verify My Scores is read-only on both judge and admin sides
24. Setup tab: archive a group (hover for archive icon, confirm) → verify it disappears from Setup + Monitor + status bar count
25. Monitor tab: verify dancer names shown under each group template header
26. Judge scoring: verify bold dancer name always visible next to number on tiles
27. Judge scoring: score categories → verify running total bar appears (blue in-progress, green when 5/5 complete, shows N/25)
