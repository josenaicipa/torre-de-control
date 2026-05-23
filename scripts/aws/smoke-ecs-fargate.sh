#!/usr/bin/env bash
# Smoke-test the deployed Torre de Control v2 ECS/Fargate stack by hitting the
# ALB health endpoint. Read-only: resolves the LoadBalancerDNSName stack output
# and curls http://<dns><health-path>.
#
# Optional environment:
#   AWS_REGION         default us-east-1
#   STACK_NAME         default torre-de-control-v2-ecs
#   HEALTH_CHECK_PATH  default /api/health
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-torre-de-control-v2-ecs}"
HEALTH_CHECK_PATH="${HEALTH_CHECK_PATH:-/api/health}"

fail() {
  echo "error: $*" >&2
  exit 1
}

DNS_NAME="$(aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNSName'].OutputValue | [0]" \
  --output text)"

[[ -n "${DNS_NAME}" && "${DNS_NAME}" != "None" ]] || fail \
  "LoadBalancerDNSName output not found on stack ${STACK_NAME}"

URL="http://${DNS_NAME}${HEALTH_CHECK_PATH}"
echo "Smoke test: ${URL}"

# -w writes the HTTP status on its own trailing line; -s keeps it quiet,
# -S surfaces errors, and we do not use -f so a non-200 still prints the body.
RESPONSE="$(curl -sS -m 20 -w $'\n%{http_code}' "${URL}")"
STATUS="${RESPONSE##*$'\n'}"
BODY="${RESPONSE%$'\n'*}"

echo "HTTP status: ${STATUS}"
echo "Body: ${BODY}"

if [[ "${STATUS}" == "200" ]]; then
  echo "Smoke test passed."
else
  fail "unexpected HTTP status ${STATUS}"
fi
