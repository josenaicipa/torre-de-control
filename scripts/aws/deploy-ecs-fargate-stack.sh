#!/usr/bin/env bash
# Deploy (create or update) the Torre de Control v2 ECS/Fargate CloudFormation
# stack. This is the *apply* step of the planned migration and is intentionally
# kept out of CI — run it manually with elevated AWS permissions.
#
# It never echoes secret values. DATABASE_URL / AUTH_SECRET are read from the
# environment and passed straight to CloudFormation as NoEcho parameters.
#
# Required environment:
#   CONTAINER_IMAGE   Full ECR image URI to run (…/torre-de-control-v2:<sha>)
#   DATABASE_URL      RDS PostgreSQL connection string
#   AUTH_SECRET       Application signing secret (>= 32 chars)
#
# Optional overrides (defaults from discovered prod values):
#   AWS_REGION                  default us-east-1
#   STACK_NAME                  default torre-de-control-v2-ecs
#   PROJECT_NAME                default torre-de-control-v2
#   VPC_ID                      default vpc-071c19bf81946e30d
#   RDS_SECURITY_GROUP_ID       default sg-02c491cd16c92b255
#   PUBLIC_SUBNET_IDS           comma-separated; auto-discovered when unset
#   CONTAINER_PORT              default 3000
#   DESIRED_COUNT               default 1
#   CPU                         default 256
#   MEMORY                      default 512
#   IMPORT_PAYMENT_TRANSACTIONS_ON_START  default 1
#   HEALTH_CHECK_PATH           default /api/health
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-torre-de-control-v2-ecs}"
PROJECT_NAME="${PROJECT_NAME:-torre-de-control-v2}"
VPC_ID="${VPC_ID:-vpc-071c19bf81946e30d}"
RDS_SECURITY_GROUP_ID="${RDS_SECURITY_GROUP_ID:-sg-02c491cd16c92b255}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
DESIRED_COUNT="${DESIRED_COUNT:-1}"
CPU="${CPU:-256}"
MEMORY="${MEMORY:-512}"
IMPORT_PAYMENT_TRANSACTIONS_ON_START="${IMPORT_PAYMENT_TRANSACTIONS_ON_START:-1}"
HEALTH_CHECK_PATH="${HEALTH_CHECK_PATH:-/api/health}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${TEMPLATE_FILE:-${SCRIPT_DIR}/../../infra/aws/ecs-fargate-torre.yml}"

fail() {
  echo "error: $*" >&2
  exit 1
}

require_nonempty() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "${value}" ]] || fail "${name} is required and must not be empty"
}

require_nonempty CONTAINER_IMAGE
require_nonempty DATABASE_URL
require_nonempty AUTH_SECRET

[[ -f "${TEMPLATE_FILE}" ]] || fail "template not found: ${TEMPLATE_FILE}"

# Discover public subnets in the target VPC when not provided. Read-only call.
if [[ -z "${PUBLIC_SUBNET_IDS:-}" ]]; then
  echo "PUBLIC_SUBNET_IDS not set — discovering public subnets in ${VPC_ID}…"
  PUBLIC_SUBNET_IDS="$(aws ec2 describe-subnets \
    --region "${AWS_REGION}" \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
              "Name=map-public-ip-on-launch,Values=true" \
    --query 'Subnets[].SubnetId' \
    --output text | tr '\t' ',')"
  [[ -n "${PUBLIC_SUBNET_IDS}" ]] || fail \
    "no public subnets discovered in ${VPC_ID}; set PUBLIC_SUBNET_IDS explicitly"
  echo "discovered public subnets: ${PUBLIC_SUBNET_IDS}"
fi

echo "Deploying stack '${STACK_NAME}' to ${AWS_REGION}"
echo "  project:        ${PROJECT_NAME}"
echo "  image:          ${CONTAINER_IMAGE}"
echo "  vpc:            ${VPC_ID}"
echo "  subnets:        ${PUBLIC_SUBNET_IDS}"
echo "  rds sg:         ${RDS_SECURITY_GROUP_ID}"
echo "  container port: ${CONTAINER_PORT}"
echo "  desired count:  ${DESIRED_COUNT}"
echo "  cpu/memory:     ${CPU}/${MEMORY}"
echo "  payment import: ${IMPORT_PAYMENT_TRANSACTIONS_ON_START}"
echo "  health path:    ${HEALTH_CHECK_PATH}"
echo "  DATABASE_URL:   [provided, not shown]"
echo "  AUTH_SECRET:    [provided, not shown]"

# Secrets are passed as parameter overrides but never printed. Avoid `set -x`.
aws cloudformation deploy \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE_FILE}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "ProjectName=${PROJECT_NAME}" \
    "VpcId=${VPC_ID}" \
    "PublicSubnetIds=${PUBLIC_SUBNET_IDS}" \
    "ExistingRdsSecurityGroupId=${RDS_SECURITY_GROUP_ID}" \
    "ContainerImage=${CONTAINER_IMAGE}" \
    "ContainerPort=${CONTAINER_PORT}" \
    "DesiredCount=${DESIRED_COUNT}" \
    "Cpu=${CPU}" \
    "Memory=${MEMORY}" \
    "DatabaseUrl=${DATABASE_URL}" \
    "AuthSecret=${AUTH_SECRET}" \
    "ImportPaymentTransactionsOnStart=${IMPORT_PAYMENT_TRANSACTIONS_ON_START}" \
    "HealthCheckPath=${HEALTH_CHECK_PATH}"

echo "Stack deploy complete. Stack outputs:"
aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].Outputs' \
  --output table

echo "Next: run scripts/aws/smoke-ecs-fargate.sh to verify ALB health."
