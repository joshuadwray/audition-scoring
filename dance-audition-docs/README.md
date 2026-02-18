# Dance Audition Scoring App - Documentation

This folder contains all documentation for the **Dance Audition Scoring App** project. These files should be moved to a new project directory to begin implementation.

## Files in This Folder

### 1. `IMPLEMENTATION_PLAN.md`
**The complete technical implementation plan.** Contains:
- Database schema (all tables, indexes, RLS policies, functions)
- Authentication architecture (PIN-based system)
- File structure and component layout
- Core workflows (admin push groups, judge scoring, score editing, session locking, CSV export)
- UI/UX specifications for judge scoring interface
- Implementation phases (7 phases broken down by week)
- Critical files to implement first
- Edge cases and solutions
- Testing strategy
- Deployment checklist

**Start here** when beginning implementation.

### 2. `DESIGN_README.md`
Original design specification document. Covers:
- Product vision and requirements
- User roles (Admin, Judge)
- Core features and workflows
- UI/UX mockup reference
- Technical stack decisions

### 3. `dance-scoring-mockup.html`
**Interactive UI mockup.** Open in a browser to see:
- Judge scoring interface (3 responsive layouts)
- Tile-based scoring UI with 1-5 rating buttons
- Color-coded progress indicators
- Mobile, tablet, and desktop layouts

## How to Use These Files

### Step 1: Create New Project Directory
```bash
mkdir /Users/joshuawray/Documents/audition-scoring
cd /Users/joshuawray/Documents/audition-scoring
```

### Step 2: Move Documentation
```bash
# Move these files from media-diary/dance-audition-docs/ to audition-scoring/
mv /Users/joshuawray/Documents/media-diary/dance-audition-docs/* .
```

### Step 3: Initialize Next.js Project
Follow Phase 1 in `IMPLEMENTATION_PLAN.md`:
```bash
# Create Next.js 14.2 app
npx create-next-app@14.2 . --typescript --tailwind --app --no-src --import-alias "@/*"

# Install dependencies
npm install @supabase/supabase-js jsonwebtoken
npm install -D @types/jsonwebtoken
```

### Step 4: Set Up Supabase
1. Create new Supabase project
2. Run database migration from `IMPLEMENTATION_PLAN.md` Section 1
3. Copy environment variables to `.env.local`

### Step 5: Begin Implementation
Follow the 7 implementation phases in `IMPLEMENTATION_PLAN.md` Section 7.

## Project Overview

**What it is:** A real-time dance audition scoring system where admins push groups of dancers to judges, who score locally and submit in batches. Uses Olympic averaging (removes high/low scores) for final results.

**Tech Stack:**
- Next.js 14.2 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Realtime)
- Vercel (deployment)

**Key Features:**
- PIN-based authentication (no user accounts)
- Admin-controlled workflow (push groups to judges)
- Local-first scoring with auto-save drafts
- Realtime progress monitoring
- Judge score review/editing until session locked
- Olympic average calculation and CSV export

## Questions?

Refer to `IMPLEMENTATION_PLAN.md` for detailed technical specifications. Each section includes code examples, database schemas, and implementation guidance.
