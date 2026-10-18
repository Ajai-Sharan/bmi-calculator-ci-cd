#!/usr/bin/env bash
# Deploy one exact image version (a git commit SHA) to the current kubectl cluster.
# If the new version does not become ready in time, roll back automatically.
#
# Usage: scripts/deploy.sh <commit-sha>
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:?usage: scripts/deploy.sh <commit-sha>}"
TIMEOUT="${ROLLOUT_TIMEOUT:-120s}"

# Put the exact image version into the manifest and apply it.
sed "s|IMAGE_TAG|${TAG}|" k8/deployment.yml | kubectl apply -f -

# Record which version this revision is, shown by "kubectl rollout history".
kubectl annotate deployment/bmi-calculator-api kubernetes.io/change-cause="deploy ${TAG}" --overwrite

if kubectl rollout status deployment/bmi-calculator-api --timeout="$TIMEOUT"; then
  echo "Deployed version ${TAG}"
else
  echo "Rollout of ${TAG} did not become ready - rolling back to the previous version" >&2
  kubectl rollout undo deployment/bmi-calculator-api
  kubectl rollout status deployment/bmi-calculator-api --timeout="$TIMEOUT"
  exit 1
fi
