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
- Latest verified image tag: `7470088`.
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

## Planned ECS/Fargate migration

This is a **prepared, not-yet-applied** migration path from App Runner to
ECS/Fargate behind an Application Load Balancer. App Runner
(`torre-de-control-v2`) stays production until an explicit cutover. Nothing in
this section is wired into the automatic `main` deploy.

Artifacts:

- `infra/aws/ecs-fargate-torre.yml` — CloudFormation template for the cluster,
  task definition, service, ALB, target group, log group, and security groups.
- `scripts/aws/deploy-ecs-fargate-stack.sh` — create/update the stack.
- `scripts/aws/smoke-ecs-fargate.sh` — curl the ALB health endpoint.
- `.github/workflows/deploy-ecs.yml` — manual (`workflow_dispatch`) build/push +
  ECS service roll, usable only after the stack exists.

### What the template provisions

- ECS cluster (`<project>-cluster`) with Container Insights enabled.
- Fargate task definition running the existing ECR image on port `3000`,
  passing `DATABASE_URL`, `AUTH_SECRET`, and
  `IMPORT_PAYMENT_TRANSACTIONS_ON_START` as container environment.
- Task execution role (ECR pull + CloudWatch logs) and an empty task role.
- CloudWatch log group `/ecs/<project>` (30-day retention).
- Internet-facing ALB on port 80 → target group health check on
  `/api/health` (expects HTTP 200) → Fargate tasks (`awsvpc`, public subnets,
  assign-public-IP enabled).
- Security groups: public 80 ingress to the ALB; ALB → ECS on the container
  port; and one **additive** ingress rule on the existing RDS security group
  (`sg-02c491cd16c92b255`) allowing the ECS task SG to reach PostgreSQL on
  `5432`. No other RDS settings are changed.

Secrets are `NoEcho` parameters only — no real values live in the template or
the repo. They currently land in the task definition as plain environment
variables (parity with the present App Runner setup); moving them to Secrets
Manager / SSM references is a follow-up, same as the existing App Runner note.

### Preflight

1. Confirm you are operating with **elevated** AWS permissions (see IAM note
   below) — the day-to-day `hermes-ops` user cannot create this stack.
2. Confirm the target VPC and the existing RDS security group:
   - VPC `vpc-071c19bf81946e30d`
   - RDS SG `sg-02c491cd16c92b255`
3. Identify two public subnets (different AZs) for the ALB and tasks. The deploy
   script auto-discovers `map-public-ip-on-launch=true` subnets in the VPC if
   `PUBLIC_SUBNET_IDS` is unset.
4. Pick the ECR image to run (the SHA-tagged image App Runner is already
   serving is a safe starting point).

### Deploy the stack

```bash
# RDS connection string and signing secret are supplied from your shell/env;
# never commit or paste real values into the repo.
CONTAINER_IMAGE='861273430072.dkr.ecr.us-east-1.amazonaws.com/torre-de-control-v2:<sha>' \
DATABASE_URL='...' \
AUTH_SECRET='...' \
scripts/aws/deploy-ecs-fargate-stack.sh
```

Overridable env: `AWS_REGION` (us-east-1), `STACK_NAME`
(`torre-de-control-v2-ecs`), `PROJECT_NAME`, `VPC_ID`,
`RDS_SECURITY_GROUP_ID`, `PUBLIC_SUBNET_IDS`, `CONTAINER_PORT`,
`DESIRED_COUNT`, `CPU`, `MEMORY`, `IMPORT_PAYMENT_TRANSACTIONS_ON_START`,
`HEALTH_CHECK_PATH`. The script validates the three required secrets are present
and never prints their values; it runs `aws cloudformation deploy` with
`CAPABILITY_NAMED_IAM`.

### Smoke test

```bash
scripts/aws/smoke-ecs-fargate.sh
```

Resolves the `LoadBalancerDNSName` output and curls `http://<dns>/api/health`,
printing the HTTP status and body. Expect `200` with `ok: true`.

### Roll new images (after the stack exists)

Run the **Deploy Torre de Control (ECS/Fargate)** workflow manually
(`workflow_dispatch`) with `stack_name` and `aws_region`. It verifies/builds the
app, pushes a SHA-tagged image, reads the stack outputs, registers a new task
definition revision with the new image, calls `aws ecs update-service`, waits
for `services-stable`, and smoke-tests the ALB. It intentionally leaves the
App Runner workflow untouched.

### Cutover

1. Keep App Runner running. Bring the ECS stack up and confirm
   `smoke-ecs-fargate.sh` passes against the ALB DNS.
2. Validate the app end-to-end through the ALB DNS (login, key API routes).
3. Repoint `control.unlockedecom.co` from App Runner to the ALB
   (Route 53 / DNS) — ideally via an HTTPS listener + ACM certificate added to
   the template before production traffic. (The current template terminates
   HTTP on port 80 only; add a 443 listener + cert as a cutover prerequisite.)
4. Watch CloudWatch logs (`/ecs/torre-de-control-v2`) and ALB target health.
5. Once stable, scale App Runner down / pause it, then decommission after a
   soak period.

### Rollback

- **Before DNS cutover:** nothing to roll back for users; delete the stack
  (`aws cloudformation delete-stack --stack-name torre-de-control-v2-ecs`).
  Deleting the stack also removes the additive RDS ingress rule it created.
- **After DNS cutover:** repoint DNS back to the App Runner URL (App Runner is
  still running). For an in-place app regression, re-run the ECS workflow with a
  previous known-good commit, or `aws ecs update-service --task-definition
  <previous-revision>` to roll the service back to the prior task definition.
- The pre-import RDS snapshot
  (`torre-control-v2-pre-import-20260522003232`) remains the database recovery
  point of last resort.

### IAM permissions needed to apply

The current `hermes-ops` user is read-mostly and **cannot apply this**. It
lacks `ecs:ListClusters` and CloudFormation access (`cloudformation:*` was
observed denied; see "Known blockers" above). Applying the stack requires an
elevated principal with at least:

- `cloudformation:CreateStack` / `UpdateStack` / `DescribeStacks` /
  `DeleteStack` / `CreateChangeSet` / `ExecuteChangeSet`
- `iam:CreateRole` / `DeleteRole` / `AttachRolePolicy` / `PutRolePolicy` /
  `PassRole` (for the task execution and task roles; needs `CAPABILITY_NAMED_IAM`)
- `ec2:CreateSecurityGroup` / `AuthorizeSecurityGroupIngress` /
  `DescribeSubnets` / `DescribeSecurityGroups`
- `ecs:CreateCluster` / `RegisterTaskDefinition` / `CreateService` /
  `UpdateService` / `DescribeServices` / `DescribeTaskDefinition`
- `elasticloadbalancing:*` for the ALB, target group, and listener
- `logs:CreateLogGroup` / `PutRetentionPolicy`

The manual `deploy-ecs.yml` workflow only needs the narrower runtime set
(`ecr:*` push, `ecs:DescribeTaskDefinition` / `RegisterTaskDefinition` /
`UpdateService` / `DescribeServices`, `cloudformation:DescribeStacks`,
`iam:PassRole` for the task roles) — but it still depends on the stack having
been created first by the elevated principal.
