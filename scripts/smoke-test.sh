#!/usr/bin/env bash
# User-journey check against a running instance: ready, expected version,
# a correct BMI answer and a rejected invalid request.
#
# Usage: scripts/smoke-test.sh <base-url> [expected-version]
set -euo pipefail

BASE_URL="${1:?usage: scripts/smoke-test.sh <base-url> [expected-version]}"
EXPECTED_VERSION="${2:-}"

for _ in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/ready" >/dev/null 2>&1; then break; fi
  sleep 1
done

health="$(curl -fsS "${BASE_URL}/health")"
echo "GET /health -> ${health}"
if [[ -n "$EXPECTED_VERSION" && "$health" != *"\"version\":\"${EXPECTED_VERSION}\""* ]]; then
  echo "FAIL: expected version ${EXPECTED_VERSION}" >&2
  exit 1
fi

bmi="$(curl -fsS -D /dev/stderr "${BASE_URL}/bmi?weight=70&height=1.75")"
echo "GET /bmi?weight=70&height=1.75 -> ${bmi}"
if [[ "$bmi" != '{"weight":70,"height":1.75,"bmi":22.86,"category":"Normal"}' ]]; then
  echo "FAIL: unexpected BMI response" >&2
  exit 1
fi

status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/bmi?weight=70abc&height=1.75")"
echo "GET /bmi?weight=70abc&height=1.75 -> HTTP ${status}"
if [[ "$status" != "400" ]]; then
  echo "FAIL: invalid input was not rejected" >&2
  exit 1
fi

echo "Smoke test passed against ${BASE_URL}"
