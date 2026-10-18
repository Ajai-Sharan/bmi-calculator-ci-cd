#!/usr/bin/env bash
# Deploy an exact image to the current kubectl context and wait for the rollout.
# If the rollout does not complete, the Deployment is rolled back to the
# previous revision and the script exits non-zero.
#
# Usage: scripts/deploy.sh <image-ref> [change-cause]
#   <image-ref> must be pinned: repo:<commit-sha> or repo@sha256:<digest>
#   e.g. scripts/deploy.sh docker.io/ajaisharan/bmi-calculator-api:<commit-sha>
# Env:   ROLLOUT_TIMEOUT (default 180s)
set -euo pipefail

IMAGE="${1:?usage: scripts/deploy.sh <image-ref> [change-cause]}"
CAUSE="${2:-deploy ${IMAGE}}"
CAUSE="${CAUSE//\"/}"
TIMEOUT="${ROLLOUT_TIMEOUT:-180s}"
DEPLOYMENT="deployment/bmi-calculator-api"
BASE_IMAGE="docker.io/ajaisharan/bmi-calculator-api"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAY="${ROOT}/.deploy"

if [[ "$IMAGE" == *@sha256:* ]]; then
  NEW_NAME="${IMAGE%@*}"
  PIN="digest: ${IMAGE#*@}"
elif [[ "${IMAGE##*/}" == *:* ]]; then
  NEW_NAME="${IMAGE%:*}"
  TAG="${IMAGE##*:}"
  if [[ "$TAG" == "latest" ]]; then
    echo "refusing to deploy the mutable :latest tag; use a commit SHA tag or digest" >&2
    exit 2
  fi
  PIN="newTag: \"${TAG}\""
else
  echo "image must be pinned with a tag or digest: ${IMAGE}" >&2
  exit 2
fi

# Throwaway overlay (git-ignored) so the committed manifests never drift.
mkdir -p "$OVERLAY"
cat > "${OVERLAY}/kustomization.yml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../k8
images:
  - name: ${BASE_IMAGE}
    newName: ${NEW_NAME}
    ${PIN}
patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: bmi-calculator-api
        annotations:
          kubernetes.io/change-cause: "${CAUSE}"
EOF

echo "==> Applying ${IMAGE}"
kubectl apply -k "$OVERLAY"

echo "==> Waiting for rollout (timeout ${TIMEOUT})"
if kubectl rollout status "$DEPLOYMENT" --timeout="$TIMEOUT"; then
  kubectl rollout history "$DEPLOYMENT"
  kubectl get pods -l app=bmi-calculator-api -o wide
  echo "==> Deployed ${IMAGE}"
  exit 0
fi

echo "==> Rollout of ${IMAGE} did not complete; diagnostics follow" >&2
kubectl get pods -l app=bmi-calculator-api -o wide >&2 || true
kubectl get events --sort-by=.lastTimestamp 2>/dev/null | tail -n 15 >&2 || true

echo "==> Rolling back to the previous revision" >&2
if kubectl rollout undo "$DEPLOYMENT"; then
  kubectl rollout status "$DEPLOYMENT" --timeout="$TIMEOUT" >&2 || true
  kubectl rollout history "$DEPLOYMENT" >&2 || true
else
  echo "no previous revision to roll back to" >&2
fi
exit 1
