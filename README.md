# Torre de Control

Operational control tower for Unlocked Ecom. Two surfaces live in this repo:

- **`index.html`** — the current production static dashboard (React/Babel via CDN,
  reads from Supabase). **Still live. Do not delete or rewrite it** until v2 is
  verified and cut over.
- **`app/`** — Torre v2, a Next.js + TypeScript application with a real backend,
  Postgres/Prisma, server-side APIs, users/roles, and an audit trail. Built
  beside the static dashboard for a controlled migration.

See `docs/plans/2026-05-21-robust-platform-migration.md` for the full migration plan.

---

## Torre v2 (`app/`)

### Stack

Next.js (App Router) · TypeScript · Prisma · PostgreSQL · Vitest. Auth is a
server-side signed HttpOnly session cookie (HMAC-SHA256), no external OAuth yet.

### Quick start (local)

```bash
# 1. Start a local Postgres (host port 5438; container 5432)
docker compose up -d postgres

# 2. Configure env
cd app
cp .env.example .env        # then edit .env with real local values
#   DATABASE_URL=postgresql://torre:torre@localhost:5438/torre_control
#   AUTH_SECRET=<openssl rand -base64 48>

# 3. Install + verify environment
npm install --include=dev
npm run stack:doctor

# 4. Database schema
npm run prisma:validate
npm run db:migrate          # creates tables (prisma migrate dev)

# 5. Create the first admin (password from env or hidden prompt — never argv)
TORRE_ADMIN_PASSWORD='your-strong-password' npm run user:create-admin -- --email you@example.com

# 6. Run
npm run dev                 # http://localhost:3000
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (domain + lib unit tests) |
| `npm run verify` | typecheck + test |
| `npm run stack:doctor` | Check Node version and required env presence (never prints secret values) |
| `npm run prisma:validate` | Validate the Prisma schema |
| `npm run prisma:generate` | Generate the Prisma client (placeholder URL safe) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run user:create-admin` | Create/update an ADMIN user safely |

### Routes

- `/` — public landing.
- `/login` — login form.
- `/dashboard` — protected; shows daily KPIs or an explicit **"sin datos"** state.
- `/api/health` — liveness; reports config presence as booleans only.
- `/api/daily` — daily metrics from Postgres, with explicit no-data fallback.
- `/api/auth/login`, `/api/auth/logout` — session lifecycle.

Middleware protects `/dashboard` and `/api/*` except `health`, `auth/login`,
and `auth/logout`.

### Data model (Prisma)

`User` (with `Role` enum: `ADMIN` / `OPERATOR` / `VIEWER`), `AuditEvent`,
`SourceSnapshot`, `DailyMetric`, `CommercialNote`.

### Business rule preserved

GHL is the source of truth for show-up status: any lead whose status is in
`SHOWED_LEAD_STATUSES` (`showed`, `show`, `show_up`, `showup`) counts as a
show-up, regardless of whether `startTime` is past, future, or missing.
Corrections happen in GHL. See `app/src/domain/appointments.ts` and its tests.

---

## Deployment

**Local/staging:** Docker Compose Postgres (`docker-compose.yml`, host port 5438)
— local development only.

**Production:** AWS **RDS PostgreSQL** (`torre-control-v2-db`) plus AWS **App
Runner** (`torre-de-control-v2`) running the Next.js app at
`control.unlockedecom.co`. Runtime config is set in AWS only and must never be
committed. App Runner currently serves the ECR image tagged with the deployed git
SHA.

CI: `.github/workflows/torre-v2-verify.yml` runs install → stack doctor → prisma
validate → verify → build on `app/**` changes, using placeholder env values only.

AWS artifacts:

- `app/Dockerfile` and `app/.dockerignore` for an AWS-compatible container image.
- `amplify.yml` for a monorepo Amplify build rooted at `app/`.
- `docs/aws-deployment.md` with current AWS/App Runner deployment notes.

---

## Python syncs (`scripts/`)

Existing CRM / ad-spend sync scripts are unchanged by the v2 foundation. They
will be encapsulated as controlled, dry-run-by-default jobs in a later phase.
Run the existing metric tests with `pytest tests/`.
