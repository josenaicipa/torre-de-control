# Torre de Control v2 — AWS deployment notes

## Target architecture

Preferred production target for Jose/Unlocked:

- App: Next.js v2 from `app/`.
- Runtime: AWS Amplify Hosting for fast staging, or App Runner/ECS when container image permissions are available.
- Database: AWS RDS PostgreSQL, separate from Ecommerce360.
- Secrets: AWS/Amplify environment variables only. Never commit `.env`.

## Required runtime secrets

Set these in the AWS runtime secret/env store:

- `DATABASE_URL` — RDS PostgreSQL connection string for Torre v2.
- `AUTH_SECRET` — strong random signing secret, >= 32 chars recommended.
- `TORRE_ADMIN_PASSWORD` — only temporarily when bootstrapping an admin, then remove/rotate.

## Current AWS permission discovery — 2026-05-21

Profile/user discovered:

- AWS account: `861273430072`
- IAM user: `hermes-ops`
- Region: `us-east-1`

Observed access:

- `sts:GetCallerIdentity`: OK.
- `amplify:ListApps`: OK. Existing app observed: `Ecommerce360`.
- `rds:DescribeDBInstances`: OK. Existing `ecommerce360-db` observed.
- `ec2:DescribeVpcs`: OK. Default VPC exists.

Observed blockers:

- `ecr:DescribeRepositories`: denied.
- `apprunner:ListServices`: denied.
- `codeconnections:ListConnections`: denied.
- `cloudformation:DescribeStacks/ListStacks`: denied.
- `iam:SimulatePrincipalPolicy`: denied.

Impact:

- We can inspect some AWS state, but cannot currently verify/push ECR or App Runner from this IAM user.
- Amplify may be the shortest AWS-hosting path if repo access/token and app creation/branch permissions are available.
- If Jose wants container deploy through ECR/App Runner/ECS, grant the missing ECR/App Runner/CodeConnections permissions or provide an existing deploy target.

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
