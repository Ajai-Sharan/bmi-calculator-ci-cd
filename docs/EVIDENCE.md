# Verification evidence

All results below come from real GitHub Actions runs on 18 Oct 2026. Credentials are stored as
GitHub secrets and are masked in the logs (the Docker Hub username appears as `***`).

- Baseline: `55df096c75ee679d46f012c4e6bd8d2af59b5b56` (tag `baseline-55df096`)
- Tested code commit: `1056be05c35f2d26b273d4949b5b2afe6197449a`. The final commit after it only adds this file.

## 1. Full flow: commit → CI → image → Kubernetes → user request

Run: [CI run 39149595018](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39149595018)
(manual run on `devops-improvements`, so the image is published). Result: **success**.

| Step | Evidence from the run log |
|---|---|
| Tests | `Tests: 20 passed, 20 total` |
| Lint | passed (0 errors) |
| npm audit (production) | `found 0 vulnerabilities` |
| OWASP Dependency-Check | passed (no dependency with CVSS ≥ 7), 0 results in GitHub Security |
| CodeQL | 0 alerts |
| Trivy | `alpine 3.24.2: 0` vulnerabilities, node packages 0; the gate passed |
| Container test | `Container user: 1000`; `{"status":"UP","version":"1056be05c35f2d26b273d4949b5b2afe6197449a"}`; `{"weight":70,"height":1.75,"bmi":22.86,"category":"Normal"}`; bad input gave HTTP 400; metrics present; clean exit on stop |
| Configurable port | container started with `PORT=8080` answered `/health` on 8080 |
| Image published (after all checks) | `1056be05c35f2d26b273d4949b5b2afe6197449a: digest: sha256:7775e90db7d1a1f2d5480a42fc4539d2acc20f31dfde16efe3ac90e366d726e6` (Docker Hub shows the same tag and digest) |
| Deployed to Kubernetes (kind) | `deployment "bmi-calculator-api" successfully rolled out`, `Deployed version 1056be05…`; 2 pods `Running` |
| Running image = published image | both pods: `docker.io/***/bmi-calculator-api@sha256:7775e90db7d1a1f2d5480a42fc4539d2acc20f31dfde16efe3ac90e366d726e6` |
| Running version | through the Service: `{"status":"UP","version":"1056be05c35f2d26b273d4949b5b2afe6197449a"}`; `kubectl rollout history` shows `1  deploy 1056be05…` |
| User request through the Service | `GET /bmi?weight=70&height=1.75` → `{"weight":70,"height":1.75,"bmi":22.86,"category":"Normal"}` |
| Metrics | `http_requests_total{method="GET",route="/bmi",status="200"} 1` |
| Trace + structured log | request sent with `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`; pod log: `{"level":"info","message":"request completed","version":"1056be05…","trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","span_id":"44a39a1af2bb20db","parent_span_id":"00f067aa0ba902b7","method":"GET","path":"/bmi","status":200,"duration_ms":0.862}` |
| Rollback | deployed `does-not-exist`: `Rollout of does-not-exist did not become ready - rolling back to the previous version` → `Image after rollback: …:1056be05…` → BMI request still `22.86` → `Rollback verified`. History: `2 deploy does-not-exist`, `3 deploy 1056be05…` |

## 2. Pull request check

[CI run 39149597453](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39149597453)
(pull request): **success**. It runs the same steps, except the image is loaded into kind instead
of pushed. For pull requests GitHub tests a merge commit, so `/health` reported
`7c8821a82e00d9bacfc25ec132cd4484a30ddddc`.

## 3. Issue found and fixed during verification

The first run ([39149442720](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39149442720))
failed at OWASP Dependency-Check because of `brace-expansion@1.1.12` (CVSS 7.5). That package
comes from ESLint/Jest (development tools) and is not in the image. The fix: remove dev
dependencies with `npm prune --omit=dev` after tests and lint, so Dependency-Check scans
exactly what runs in production. The CVSS ≥ 7 rule was kept.

## Limitations

- **Kubernetes:** the deployment runs on a temporary kind cluster inside GitHub Actions, which is
  deleted after the run. It is not a permanent environment.
- **DigitalOcean CD is not verified.** The stored DigitalOcean token is rejected: CD run
  [39149957839](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39149957839)
  failed at `doctl` with `Validating token... ✗ status 401`. That run used the old `cd.yml`
  still on `main`, which triggers on any CI run. The new `cd.yml` runs only for `main` and only
  when `ENABLE_DO_DEPLOY=true`.
- **Push to `main` not exercised:** this PR is not merged yet, so the automatic main-branch run
  has not happened. The same publish and deploy steps ran in the manual run above.
- **Dev-only advisories remain:** `npm audit` without `--omit=dev` still reports issues in
  ESLint/Jest dependencies. They are not part of the image.
- **Monitoring scope:** no Prometheus/Grafana server is installed. Metrics are exposed and were
  checked with `curl`, and traces are written to the logs.
