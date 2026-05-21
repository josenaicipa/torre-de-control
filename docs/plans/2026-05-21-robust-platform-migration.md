# Torre de Control Robust Platform Migration Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Hermes/GPT-5.5 orquesta y verifica; Claude Code implementa.

**Goal:** Convertir Torre de Control de un dashboard estático con scripts Python/Supabase directo a una plataforma robusta tipo Ecommerce360: app con backend, Docker local, Postgres propio, usuarios/roles, auditoría y deploy controlado.

**Architecture:** Migración incremental, sin romper producción actual. Mantener el `index.html` como referencia funcional mientras se crea una app Next.js/TypeScript paralela en `app/`, con Prisma/Postgres, auth por sesión, APIs server-side y jobs/syncs controlados. El frontend nunca debe leer secretos ni escribir directo a sistemas externos.

**Tech Stack:** Next.js + TypeScript + Tailwind, Prisma, PostgreSQL local vía Docker Compose, Auth.js/NextAuth o sesión interna con cookie HttpOnly, Vitest/Playwright, Python syncs encapsulados como jobs, deploy posterior en Netlify/AWS según decisión.

---

## Current State Found

- Repo: `/home/ubuntu/proyectos/torre-de-control`
- Git remote: `git@github.com:josenaicipa/torre-de-control.git`
- Branch: `main`
- Current app: single large static `index.html` (~3.5k lines), React/Babel loaded from CDN.
- Data: browser connects directly to Supabase with anon key in `index.html`.
- Syncs: Python scripts under `scripts/` write/sync CRM/ad spend data.
- Tests: `tests/test_appointment_metrics.py` exists for business metric logic.
- Missing today: package manager app stack, server-side API, Docker DB, Prisma schema, auth/user model, role-based access, migration/deploy pipeline equivalent to Ecommerce360.

## Decision

Build **Torre v2** as a real app beside the current static dashboard, then cut over once verified.

Do **not** try to Dockerize only the static file as the main fix. Docker alone would make hosting cleaner but would not solve users, permissions, secret exposure, backend APIs, audit trail or safe collaboration.

---

## Phase 0 — Safety Snapshot

### Task 0.1: Confirm clean git state

**Objective:** Avoid mixing pending production fixes with migration work.

**Files:** none

**Commands:**

```bash
cd /home/ubuntu/proyectos/torre-de-control
git status --short --branch
git log --oneline -5
```

**Expected:** clean or only intentional plan docs.

### Task 0.2: Create migration branch

**Objective:** Keep robust-platform work isolated.

```bash
git checkout -b feature/robust-platform-v2
```

**Expected:** new branch from `main`.

---

## Phase 1 — App Foundation

### Task 1.1: Create Next.js app shell in `app/`

**Objective:** Add modern app stack without deleting current `index.html`.

**Files:**
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/next.config.ts`
- Create: `app/src/app/page.tsx`
- Create: `app/src/app/layout.tsx`
- Create: `app/src/app/globals.css`

**Scripts required:**

```json
{
  "dev": "next dev",
  "build": "next build",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "verify": "npm run typecheck && npm run test",
  "stack:doctor": "node scripts/stack-doctor.mjs"
}
```

**Verification:**

```bash
cd app
npm install --include=dev
npm run typecheck
npm run build
```

### Task 1.2: Add Docker Compose for local Postgres

**Objective:** Local dev database independent from production Supabase.

**Files:**
- Create: `docker-compose.yml`
- Create: `app/.env.example`

**Compose target:**
- Service: `postgres`
- Image: `postgres:16-alpine`
- Host port: `5438:5432` to avoid collisions with other Jose apps.
- DB: `torre_control`
- User: `torre`

**Important:** app commands from host use `localhost:5438`; containers use `postgres:5432`.

**Verification:**

```bash
docker compose up -d postgres
docker compose ps
```

---

## Phase 2 — Data Model / Prisma

### Task 2.1: Add Prisma schema

**Objective:** Model users, roles, source snapshots and daily metrics before moving UI.

**Files:**
- Create: `app/prisma/schema.prisma`
- Create: `app/src/lib/prisma.ts`

**Initial models:**
- `User`: email, name, password/session provider fields, role, active.
- `AuditEvent`: actor, action, target, metadata, createdAt.
- `SourceSnapshot`: source, sourceDate, hash, rawSummary, createdAt.
- `DailyMetric`: date, channel, spend, booked, showed, closed, revenue, raw JSON.
- `CommercialNote`: lead/contact identifiers, outcome, owner, note, GHL sync status.

**Verification:**

```bash
cd app
DATABASE_URL='postgresql://torre:torre@localhost:5438/torre_control' npx prisma validate
DATABASE_URL='postgresql://torre:torre@localhost:5438/torre_control' npx prisma migrate dev --name init
npm run typecheck
```

### Task 2.2: Port appointment metric logic into TypeScript domain tests

**Objective:** Protect the GHL source-of-truth rule: if GHL says `showed`, Torre counts it; corrections happen in GHL.

**Files:**
- Create: `app/src/domain/appointments.ts`
- Create: `app/src/domain/appointments.test.ts`

**Acceptance:** tests cover:
- `showed` status counts as show up.
- Non-show statuses do not count.
- Today/agenda and attendance calculations are deterministic by timezone.

**Verification:**

```bash
cd app
npm run test -- appointments
```

---

## Phase 3 — Auth / Users / Permissions

### Task 3.1: Add server-side session auth

**Objective:** Stop relying on open static access; create real user sessions.

**Files:**
- Create: `app/src/lib/auth.ts`
- Create: `app/src/app/login/page.tsx`
- Create: `app/src/app/api/auth/login/route.ts`
- Create: `app/src/app/api/auth/logout/route.ts`
- Create: `app/src/middleware.ts`

**Default roles:**
- `admin`: Jose/Hermes/admin ops.
- `operator`: can view dashboard and add operational notes.
- `viewer`: read-only.

**Security rules:**
- Use signed HttpOnly cookie.
- Passwords/secrets never in repo.
- `.env.example` only documents required env vars.
- Middleware protects dashboard/API routes.

**Verification:**

```bash
cd app
npm run verify
npm run build
```

Then browser smoke:
- `/` redirects unauthenticated users to `/login`.
- Login creates session cookie.
- `/dashboard` loads after login.

### Task 3.2: Add user management seed/admin command

**Objective:** Create first admin safely without exposing secrets.

**Files:**
- Create: `app/scripts/create-admin.ts`
- Modify: `app/package.json`

**Command:**

```bash
npm run user:create-admin -- --email jose@unlockedecom.co
```

The command should prompt for password or read from protected env var, not from command history.

---

## Phase 4 — Backend API Facade

### Task 4.1: Create `/api/daily` endpoint

**Objective:** Frontend reads metrics through server-side API, not directly from Supabase/browser.

**Files:**
- Create: `app/src/app/api/daily/route.ts`
- Create: `app/src/lib/daily-data.ts`
- Create: `app/src/lib/daily-data.test.ts`

**Behavior:**
- Reads latest `DailyMetric` rows from Postgres.
- Returns metadata: `mode`, `source`, `freshness`, `lastSyncAt`.
- If DB empty, returns explicit empty/no-data state, not fake numbers.

### Task 4.2: Create `/dashboard` v2 skeleton

**Objective:** Render the core Torre KPIs from `/api/daily`.

**Files:**
- Create: `app/src/app/dashboard/page.tsx`
- Create: `app/src/components/kpi-card.tsx`

**Acceptance:**
- Mobile-first.
- Shows current daily KPIs and freshness.
- Shows “sin datos” state clearly.

---

## Phase 5 — Sync Job Encapsulation

### Task 5.1: Wrap existing Python syncs as controlled jobs

**Objective:** Keep current business sync logic but run it through safer app-owned commands.

**Files:**
- Modify: `scripts/sync-auto-crm-revenue-to-supabase.py` only if needed for dry-run/export mode.
- Create: `app/scripts/sync-crm.ts`
- Create: `app/scripts/sync-ads.ts`

**Rules:**
- Default dry-run.
- `--write` required for DB writes.
- Writes go to Torre Postgres first.
- No writes back to GHL/Ads unless explicitly scoped later.
- Store `SourceSnapshot` hash/lineage for each import.

**Verification:**

```bash
cd app
npm run sync:crm -- --dry-run
npm run sync:ads -- --dry-run
```

### Task 5.2: Add audit events

**Objective:** Every manual note/status change has actor and timestamp.

**Files:**
- Create: `app/src/lib/audit.ts`
- Modify API routes that mutate notes/outcomes.

**Acceptance:**
- Mutation without session rejected.
- Mutation with session writes `AuditEvent`.

---

## Phase 6 — Deploy/Staging

### Task 6.1: Add CI verification

**Objective:** Branch/PR must pass before production cutover.

**Files:**
- Create: `.github/workflows/torre-v2-verify.yml`

**Checks:**
- `cd app && npm ci --include=dev`
- Prisma validate with placeholder URL.
- `npm run verify`
- `npm run build`

### Task 6.2: Decide hosting target

**Objective:** Choose deployment path before production secrets.

**Recommended options:**

1. **AWS App Runner/ECS + RDS Postgres** — best long-term, closest to robust infra.
2. **Netlify app + AWS RDS/Supabase Postgres** — faster cutover, less infra.
3. **Single Docker instance on VPS** — okay as staging, but weaker than AWS managed DB for production.

**Recommended for Jose now:** Docker local/staging + AWS RDS production, same pattern as robust internal apps. Keep Netlify only if speed is more important than infra control.

### Task 6.3: Production cutover

**Objective:** Switch public domain only after v2 matches/beat v1.

**Pre-cutover checklist:**
- Auth works.
- Admin user exists.
- Daily KPIs match current v1 for same date.
- GHL `showed` source-of-truth rule preserved.
- Sync dry-run/write verified.
- Audit log records mutations.
- CI green.
- Rollback path: current static `index.html` remains deployable.

---

## Non-Negotiables

- Do not delete or rewrite current production `index.html` until v2 is verified.
- Do not expose real `.env`, Supabase service keys, GHL tokens, ad account tokens or DB URLs.
- Browser frontend must not own privileged writes.
- Users/roles must exist before inviting collaborators.
- Deploy/cutover requires explicit approval.

## First Execution Slice

Implement only this first:

1. Branch `feature/robust-platform-v2`.
2. `app/` Next.js shell.
3. Docker Postgres.
4. Prisma initial schema.
5. Auth/session skeleton.
6. One protected `/dashboard` page with empty/no-data state.
7. Verification commands green.

Then stop and review before migrating real data/syncs.
