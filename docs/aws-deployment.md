# Torre de Control v2 — AWS deployment notes

## Target architecture

Production target for Jose/Unlocked:

- App: Next.js v2 from `app/`.
- Runtime: AWS App Runner service `torre-de-control-v2` in `us-east-1`.
- Image: ECR repository `torre-de-control-v2`, tagged by git SHA.
- Database: AWS RDS PostgreSQL `torre-control-v2-db`, separate from Ecommerce360.
- Domain: `control.unlockedecom.co`.
- Secrets/config: AWS runtime configuration only. Never commit `.env` or raw values.

## Required runtime secrets

Set these in the AWS runtime secret/env store:

- `DATABASE_URL` — RDS PostgreSQL connection string for Torre v2.
- `AUTH_SECRET` — strong random signing secret, >= 32 chars recommended.
- `TORRE_ADMIN_PASSWORD` — only temporarily when bootstrapping an admin, then remove/rotate.

## Current AWS state — 2026-05-22

Profile/user discovered:

- AWS account: `861273430072`
- IAM user: `hermes-ops`
- Region: `us-east-1`

Observed access:

- `sts:GetCallerIdentity`: OK.
- `amplify:ListApps`: OK. Existing app observed: `Ecommerce360`.
- `rds:DescribeDBInstances`: OK. Existing `ecommerce360-db` observed.
- `ec2:DescribeVpcs`: OK. Default VPC exists.
- `ecr:DescribeImages`: OK for `torre-de-control-v2`.
- `apprunner:ListServices` / `DescribeService`: OK for `torre-de-control-v2`.
- `logs:FilterLogEvents`: OK for App Runner log groups.

Known blockers / follow-ups:

- `codeconnections:ListConnections`: denied.
- `cloudformation:DescribeStacks/ListStacks`: denied.
- `iam:SimulatePrincipalPolicy`: denied.
- Move App Runner runtime secrets from plain runtime environment variables into
  AWS secret references / SSM or Secrets Manager when approved.

Current verified deploy:

- App Runner service: `torre-de-control-v2`, status `RUNNING`.
- Runtime port: `3000`.
- Health endpoint: `/api/health` returns `ok: true`.
- Latest verified image tag: `d31d874`.
- Pre-import RDS snapshot: `torre-control-v2-pre-import-20260522003232`, status
  `available`.

## Build locally as AWS-compatible container

From repo root:

```bash
docker build -f app/Dockerfile -t torre-de-control-v2 ./app
```

Run locally:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://torre:torre@host.docker.internal:5438/torre_control' \
  -e AUTH_SECRET='replace-with-strong-secret' \
  torre-de-control-v2
```

## Amplify build

Amplify notes are historical/staging-only. Production currently runs on App
Runner.

`amplify.yml` is configured for monorepo app root `app/`:

1. `npm ci --include=dev`
2. `npm run prisma:generate`
3. `npm run verify`
4. `npm run build`

Production/staging env vars must be configured in Amplify before login/API routes are usable.

## DB bootstrap

After RDS `DATABASE_URL` is configured:

```bash
cd app
DATABASE_URL='...' npx prisma migrate deploy
TORRE_ADMIN_PASSWORD='temporary-strong-password' DATABASE_URL='...' npm run user:create-admin -- --email jose@unlockedecom.co --name Jose
```

Remove `TORRE_ADMIN_PASSWORD` from the runtime environment after admin creation.
