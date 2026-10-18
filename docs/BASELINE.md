# Baseline record

| | |
|---|---|
| Student | Ajai Sharan — student identifier: _to be filled in by the student_ |
| Project | BMI Calculator API (`bmi-calculator-ci-cd`) |
| Repository | https://github.com/Ajai-Sharan/bmi-calculator-ci-cd |
| Baseline commit | `55df096c75ee679d46f012c4e6bd8d2af59b5b56` ("Added the README.md file") |
| Permanent link | https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/tree/55df096c75ee679d46f012c4e6bd8d2af59b5b56 |
| Tag | `baseline-55df096` (annotated tag on the same commit) |

The baseline commit is also the current tip of `main`. All improvements are in a single pull
request from `feat/immutable-image-releases`, and no history was rewritten.

## Application

A Node.js/Express HTTP API: `GET /bmi?weight=<kg>&height=<m>` returns the BMI and its category;
`GET /health` returns `{"status":"UP"}`.

## DevOps features that already existed at the baseline

| Area | Baseline state |
|---|---|
| Tests / lint | 4 Jest unit tests for `BMICalculator`; ESLint flat config (no recommended rules) |
| CI (`ci.yml`) | One job on push to `main`: `npm ci` → test → lint → OWASP Dependency-Check (SARIF) → CodeQL → `docker build` → Trivy scan (CRITICAL only, `continue-on-error: true`, so never blocking) → push `:latest` → container `/health` smoke test **after** the push |
| CD (`cd.yml`) | On any completed CI run (`if: success`): `doctl` kubeconfig → `kubectl apply -f k8/deployment.yml` → `kubectl rollout status` against DigitalOcean Kubernetes |
| Container | `node:18-alpine` (end-of-life), `COPY package.json` + `npm install` (lockfile ignored; jest/eslint installed as runtime deps), runs as root, started via `npm start` |
| Kubernetes | 1-replica Deployment, image `ajaisharan/bmi-calculator-api` (implicit `:latest`), liveness and readiness both on `/health`, requests/limits, `LoadBalancer` Service 80 → 3000 |
| Observability | One `console.log` at start-up; no metrics, structured logs or tracing |

## Gaps identified before changes

1. The mutable `:latest` tag was the only release artifact, so the running version could not be
   traced to a commit, and the manifest never changed, so `kubectl apply` did not roll out new
   images.
2. The image was pushed before the smoke test and regardless of Trivy findings.
3. The `PORT` env var was set in the manifest but ignored by the code (hard-coded 3000).
4. Validation accepted `weight=70abc` (parseFloat) and had BMI category gaps (24.9–25 and
   29.9–30 were labelled "Obese").
5. The container ran as root, with dev tooling and an EOL Node version; production
   dependencies had 1 critical and 1 high `npm audit` finding.
6. No readiness/liveness distinction, graceful shutdown or securityContext; the service-account
   token was mounted.
7. No metrics, structured logs or traces.
8. Workflow permissions were broader than needed (`packages: write` unused, CD `id-token: write`
   unused), and a third-party action was referenced by `@main`.
