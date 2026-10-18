# BMI Calculator API

A small Node.js/Express service that calculates Body Mass Index. It is tested and scanned in
GitHub Actions, packaged as a container image tagged with the git commit SHA, and deployed to
Kubernetes. It exposes Prometheus metrics, JSON logs and request trace IDs.

BMI formula: $BMI=\dfrac{weight_{kg}}{height_{m}^2}$

## Baseline

| | |
|---|---|
| Repository | https://github.com/Ajai-Sharan/bmi-calculator-ci-cd |
| Baseline commit (before this work) | [`55df096c75ee679d46f012c4e6bd8d2af59b5b56`](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/tree/55df096c75ee679d46f012c4e6bd8d2af59b5b56) (tag `baseline-55df096`) |

**What already existed at the baseline:** an Express API (`/bmi`, `/health`), 4 Jest tests,
ESLint, a Dockerfile (`node:18`, running as root), and a CI workflow. That workflow ran tests,
lint, OWASP Dependency-Check, CodeQL and a non-blocking Trivy scan, then pushed only a `:latest`
image. There was also a CD workflow (`kubectl apply` to DigitalOcean) and one Kubernetes
Deployment + LoadBalancer Service with probes and resource limits.

**What this work adds:**

| Area | Change |
|---|---|
| App | Strict input validation (e.g. `weight=70abc` was accepted, now `400`); fixed the BMI category bug (24.9–25 and 29.9–30 were "Obese"); configurable `PORT`; graceful shutdown on SIGTERM |
| Tests | 4 → 20 tests, including API tests with `supertest` |
| Container | Node 24, `npm ci --omit=dev` from the lockfile (test tools no longer in the image), runs as non-root user, npm removed from the final image |
| CI/CD | Image tagged with the **commit SHA**, pushed **only after** all checks pass; Trivy now blocks fixable HIGH/CRITICAL; container smoke test runs **before** push; the same version is deployed to a kind cluster and verified, including an automatic rollback test |
| Kubernetes | 2 replicas, zero-downtime rolling update, ConfigMap for config, pod/container security settings, no service-account token |
| Observability | `/metrics` (Prometheus), JSON request logs, W3C `traceparent` trace IDs and spans |
| Security | Least-privilege workflow permissions, pinned third-party actions, `npm audit` gate |

## Architecture

```
                 GitHub (push / pull request)
                          │
                          ▼
   GitHub Actions CI: test → lint → npm audit → Dependency-Check → CodeQL
                     → docker build (tag = commit SHA) → Trivy → container smoke test
                     → push image to Docker Hub (main only)
                     → deploy to kind cluster → verify request → rollback test
                          │
                          ▼
   Kubernetes:  Client ──► Service (port 80) ──► Deployment (2 pods, port 3000)
                                                   ├─ GET /bmi     (the API)
                                                   ├─ GET /health  (liveness/readiness probes)
                                                   └─ GET /metrics (Prometheus)
```

| File | Purpose |
|---|---|
| [src/bmi.js](src/bmi.js) | BMI calculation and category |
| [src/app.js](src/app.js) | HTTP routes and input validation |
| [src/observability.js](src/observability.js) | Metrics, JSON logs, trace IDs |
| [src/server.js](src/server.js) | Starts the server on `PORT`, graceful shutdown |
| [tests/](tests/) | Unit tests (`bmi.test.js`) and API tests (`api.test.js`) |
| [Dockerfile](Dockerfile) | Container image |
| [k8/deployment.yml](k8/deployment.yml) | ConfigMap, Deployment, Service |
| [scripts/deploy.sh](scripts/deploy.sh) | Deploy an exact version and roll back automatically if it fails |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | CI pipeline (checks → image → publish → deploy to kind) |
| [.github/workflows/cd.yml](.github/workflows/cd.yml) | CD to DigitalOcean Kubernetes (optional, see below) |

The app is stateless and has no database, so a Deployment (not a StatefulSet) fits, and pods can
be replaced at any time.

## API

| Request | Response |
|---|---|
| `GET /bmi?weight=70&height=1.75` | `200 {"weight":70,"height":1.75,"bmi":22.86,"category":"Normal"}` |
| `GET /bmi?weight=70abc&height=1.75` | `400 {"error":"…","traceId":"…"}` |
| `GET /health` | `200 {"status":"UP","version":"<commit SHA>"}` |
| `GET /metrics` | Prometheus metrics |

Validation: weight must be 1–700 kg and height 0.3–3 m, both given as plain numbers. Height is in metres.

## Prerequisites

- Node.js 20+ (CI and the image use Node 24) and npm
- Docker
- kind (or Minikube) and kubectl, for running on Kubernetes locally

## Run locally

```bash
# 1. Without Docker
npm ci
npm test
npm run lint
npm start                                  # http://localhost:3000
curl "http://localhost:3000/bmi?weight=70&height=1.75"
PORT=8080 npm start                        # the port is configurable

# 2. With Docker
docker build --build-arg APP_VERSION=local -t bmi-calculator-api:local .
docker run --rm -p 3000:3000 bmi-calculator-api:local
curl http://localhost:3000/health

# 3. On Kubernetes with kind
kind create cluster --name bmi
SHA=$(git rev-parse HEAD)
docker build --build-arg APP_VERSION=$SHA -t docker.io/ajaisharan/bmi-calculator-api:$SHA .
kind load docker-image docker.io/ajaisharan/bmi-calculator-api:$SHA --name bmi
scripts/deploy.sh $SHA                      # applies k8/deployment.yml with this exact version
kubectl get pods
kubectl port-forward svc/bmi-calculator-api-service 8080:80
curl "http://localhost:8080/bmi?weight=70&height=1.75"   # in another terminal
kind delete cluster --name bmi             # clean up
```

To deploy an image that CI already published, skip the build and `kind load` steps and run
`scripts/deploy.sh <commit-sha>`; Kubernetes pulls it from Docker Hub. On kind the Service's
external IP stays `<pending>` (there is no cloud load balancer), which is why `port-forward`
is used.

## CI/CD and release flow

1. **Checks:** `npm test`, `npm run lint`, `npm audit --omit=dev`, OWASP Dependency-Check, CodeQL.
2. **Build:** `docker build` with the image tagged `:<commit SHA>`. The SHA is also baked into
   the image and returned by `/health`.
3. **Scan and test the image:** Trivy (the pipeline fails on fixable HIGH/CRITICAL), then run
   the container and test `/health`, `/bmi`, bad input, `/metrics`, the custom port, the non-root
   user and a clean shutdown.
4. **Publish:** `docker push :<commit SHA>`, only on `main` (or a manual run) and only if every
   step above passed. Pull requests run everything except the push.
5. **Deploy:** `scripts/deploy.sh <commit SHA>` puts that exact tag into the manifest, runs
   `kubectl apply`, and waits for `kubectl rollout status`. In CI this targets a temporary kind
   cluster.
6. **Verify:** a BMI request through the Service, a version check, metrics and trace logs.
7. **Rollback test:** deploy a version that does not exist, confirm the script rolls back
   automatically, and check that the old version still serves requests.

**Release strategy:** rolling update with `maxUnavailable: 0`. A new pod receives traffic only
after its readiness probe passes, so a broken release never replaces the working pods.

**Traceability:** commit SHA → image tag → `/health` `version` → `kubectl rollout history`
(change-cause `deploy <sha>`).

**CD to DigitalOcean (`cd.yml`):** kept from the baseline and updated to deploy the same SHA
image through `scripts/deploy.sh`. The DigitalOcean token stored in the repository secrets is
no longer valid (it returns HTTP 401), so CD only runs when the repository variable
`ENABLE_DO_DEPLOY` is set to `true`, after the token has been renewed.

## Rollback

- **Automatic:** if a new version is not ready within 120 s, `scripts/deploy.sh` runs
  `kubectl rollout undo`. CI tests this on every run.
- **Manual (fast):** `kubectl rollout undo deployment/bmi-calculator-api`. Use
  `kubectl rollout history deployment/bmi-calculator-api` to see the revisions.
- **Manual (traceable):** `scripts/deploy.sh <last-good-commit-sha>`, then `git revert` the bad
  commit so `main` matches what is running.
- **Verify recovery:** `kubectl rollout status deployment/bmi-calculator-api`, check that
  `/health` shows the expected version, and that `/bmi?weight=70&height=1.75` returns 22.86.

## Observability

- **Metrics** (`GET /metrics`, Prometheus format):
  - `http_requests_total{method,route,status}`
  - `http_request_duration_seconds` (histogram)
  - Node.js process metrics (CPU, memory, event loop)
  - The pods carry `prometheus.io/scrape` annotations so a Prometheus server can find them.
- **Logs:** one JSON line per request on stdout with `trace_id`, `span_id`, `method`, `path`,
  `status`, `duration_ms` and `version`. Errors are logged at `error` level with the stack
  trace. View them with `kubectl logs -l app=bmi-calculator-api`.
- **Tracing:** each request is a span. If the caller sends a W3C `traceparent` header, its trace
  ID is continued and its span becomes the parent. Otherwise a new trace ID is created. The
  response returns `traceparent` and `x-trace-id`, and error responses include `traceId`, so a
  user's error can be found in the logs with `grep <traceId>`.

**What healthy means (example targets):**

| Signal | Healthy | If not |
|---|---|---|
| Pods ready | 2/2 (`kubectl get deploy`) | `kubectl describe pod`, check probe failures and events |
| Error rate | 5xx < 1 % of `/bmi` requests (`http_requests_total{status=~"5.."}`) | Find the trace IDs in the logs; roll back if a new release caused it |
| Latency | p95 < 100 ms (`http_request_duration_seconds`) | Check CPU limits; add replicas |
| Version | `/health` shows the expected SHA | Redeploy the intended SHA |

## Security

- **Pipeline:** workflow permissions are read-only by default. Docker Hub credentials are
  GitHub secrets and are used only in the push step. Third-party actions are pinned to a fixed
  version. Pull requests never publish.
- **Checks:** `npm audit` (production dependencies), OWASP Dependency-Check, CodeQL and Trivy
  (blocking), with results uploaded to GitHub Security.
- **Container:** non-root user, only production dependencies, npm removed, OS packages
  upgraded.
- **Kubernetes:** `runAsNonRoot`, read-only root filesystem, all Linux capabilities dropped,
  no privilege escalation, no service-account token, CPU/memory limits.
- **App:** strict input validation, generic error messages (no stack traces sent to the client),
  `X-Powered-By` header removed.
- **Secrets:** the app needs none. No credentials are stored in the repository.

## Troubleshooting

| Problem | Check |
|---|---|
| `ImagePullBackOff` | Was the image pushed by CI? On kind, did you run `kind load docker-image`? |
| `CrashLoopBackOff` | `kubectl logs <pod> --previous` |
| Rollout stuck, then rolled back | `kubectl describe pod <pod>` and `kubectl get events` (readiness probe failing?) |
| Service `EXTERNAL-IP` is `<pending>` on kind | Expected; use `kubectl port-forward svc/bmi-calculator-api-service 8080:80` |
| `400` for a valid-looking request | Height must be in metres (1.75, not 175) |
| `kubectl apply -f k8/deployment.yml` gives `ImagePullBackOff` | The manifest contains the placeholder `IMAGE_TAG`; deploy with `scripts/deploy.sh <sha>` |
| CD workflow is skipped | Set the repository variable `ENABLE_DO_DEPLOY=true` (after renewing the DigitalOcean token) |

## Design decisions

- **kind instead of a paid cloud cluster.** The brief allows local Kubernetes, and the stored
  DigitalOcean token has expired. kind is a real cluster that CI can create and delete in
  every run.
- **One CI job.** The steps run in order and any failure stops the pipeline, so the image cannot
  be pushed before tests and scans pass. Splitting into parallel jobs would be faster but harder
  to follow.
- **Rolling update** instead of blue-green or canary. It is enough for one small stateless
  service and needs no extra traffic-routing tools.
- **`sed` + `kubectl apply`** instead of Helm or Kustomize. Only the image tag changes between
  deployments, so a templating tool is not needed.
- **Simple tracing and logging without extra libraries.** There is a single service with no
  downstream calls, so a full OpenTelemetry/Jaeger setup would be more infrastructure than the
  app. The trace format follows the W3C standard, so a tracing backend could be added later.
- **The same `/health` endpoint for liveness and readiness.** The app has no dependencies to
  check. If a database were added, readiness should check it separately.

## Limitations

- The Kubernetes deployment is verified on a temporary kind cluster in CI, not on a permanent
  cloud cluster. DigitalOcean CD is disabled until the token is renewed.
- No Prometheus/Grafana server is installed; metrics are exposed and checked, but not stored.
- No NetworkPolicy, autoscaling (HPA) or image signing.
- Evidence from the pipeline runs: see [docs/EVIDENCE.md](docs/EVIDENCE.md).
