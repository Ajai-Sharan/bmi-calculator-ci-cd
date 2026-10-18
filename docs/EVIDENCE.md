# Verification evidence

Everything below was observed in real runs on 18 Oct 2026. Run links stay valid while GitHub keeps
the logs (90 days by default). Credentials are masked by GitHub; no secret values appear here.

- **Baseline:** `55df096c75ee679d46f012c4e6bd8d2af59b5b56` (tag `baseline-55df096`)
- **Pull request:** https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/pull/1
- The exact final commit and its own runs are listed in the PR description, because a commit
  cannot contain its own CI results.

## 1. End-to-end chain: source → CI → image → Kubernetes → user request

Release-path run (manual dispatch, so the gated `publish` job runs):
**[CI run 39146538496](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39146538496)**,
all 6 jobs succeeded.

| Link in the chain | Evidence (from the run log) |
|---|---|
| Source commit | `adf91b495964d15f5960b254258e1f297a984039` on `feat/immutable-image-releases` |
| Checks passed before publish | Test/lint/audit ✅ · CodeQL ✅ · OWASP Dependency-Check ✅ · Build + Trivy gate + container smoke test ✅ |
| Image published | `docker.io/ajaisharan/bmi-calculator-api:adf91b495964d15f5960b254258e1f297a984039` → `digest: sha256:73678b3f5f8473429cd06e2fee0c0dafa17df725b1e7c42b9bbca9b33dbb339a` (Docker Hub lists the same tag and digest) |
| Deployed by digest | `==> Applying docker.io/ajaisharan/bmi-calculator-api@sha256:73678b3f…b339a` → `deployment "bmi-calculator-api" successfully rolled out` on kind (Kubernetes v1.37.0) |
| Running pods = published image | Both pods: `image=…@sha256:73678b3f…b339a  imageID=docker.io/ajaisharan/bmi-calculator-api@sha256:73678b3f…b339a` |
| Running version traceable | `kubectl rollout history` → `1  commit adf91b495964d15f5960b254258e1f297a984039 (CI run 39146538496)`; `GET /health -> {"status":"UP","version":"adf91b495964d15f5960b254258e1f297a984039"}`; `app_info{version="adf91b49…"} 1` |
| Successful user request (through the Service) | `GET /bmi?weight=70&height=1.75 -> {"weight":70,"height":1.75,"bmi":22.86,"category":"Normal"}` and `{"weight":82,"height":1.8,"bmi":25.31,"category":"Overweight"}` |
| Invalid input rejected | `GET /bmi?weight=70abc&height=1.75 -> HTTP 400` |
| Metrics | `bmi_calculations_total{category="Normal"} 1`, `{category="Overweight"} 1`, `http_requests_total{route="/bmi",status_code="400"} 1` from the in-cluster metrics port |
| Trace propagation | Request sent with `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`; pod log shows `"trace_id":"4bf92f3577b34da6a3ce929d0e0e4736" … "span_name":"GET /bmi" … "parent_span_id":"00f067aa0ba902b7"`, plus child spans `bmi.validate` / `bmi.calculate` |
| Pod security | `kubectl exec … id` → `uid=1000(node) gid=1000(node)`; writing to `/app` fails (read-only root FS); no service-account token mounted |
| Rollback and recovery | Deployed `…:does-not-exist-adf91b4…` → `ImagePullBackOff` → rollout timed out → automatic `kubectl rollout undo` → `Requests during bad rollout: 46 OK, 0 failed` → `Image after rollback: …@sha256:73678b3f…b339a` → smoke test passed again |

The `latest` tag was **not** moved by this run (it only moves on `main`). Docker Hub still
shows `latest` at the February 2026 digest `sha256:de98211e…`.

## 2. Pull-request runs (checks plus kind deployment, no publish)

| Run | Commit tested | Result |
|---|---|---|
| [39146190812](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39146190812) | `962a079b…` (GitHub's test merge of `c7ea99b` into `main`) | All jobs ✅, publish skipped as designed |
| [39146541435](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39146541435) | merge of `adf91b4` | All jobs ✅, publish skipped as designed |

PR runs build GitHub's merge commit (`refs/pull/1/merge`), so `/health` reports that merge SHA,
not the branch head. Run 39146190812 recorded the same journey and rollback drill
(`47 OK, 0 failed`).

## 3. Check results

| Check | Result | Where |
|---|---|---|
| ESLint (`@eslint/js` recommended) | 0 problems | CI `test` job; local |
| Jest | **57 passed** (baseline: 4); statements 94.9 %, branches 95.7 %; threshold enforced | CI `test` job; local |
| `npm audit --omit=dev --audit-level=high` | `found 0 vulnerabilities` (baseline prod deps: 1 critical, 1 high, 1 moderate, 1 low) | CI `test` job |
| CodeQL | 0 alerts | GitHub code scanning (PR #1) |
| OWASP Dependency-Check (`--failOnCVSS 7`) | Passed; 0 SARIF results | CI `dependency-check` job |
| Trivy (HIGH/CRITICAL gate, fixable) | `alpine 3.24.2: 0`, all node packages `0`; SARIF with MEDIUM+ also 0 | CI `image` job |
| Image user / tooling | `Image user is 1000:1000 and npm/yarn are absent` | CI `image` job |
| Container smoke test (`--read-only --cap-drop ALL --security-opt no-new-privileges`) | Passed: version, BMI, 400 on bad input | CI `image` job |
| Configurable port | `PORT=8080` container passed the smoke test on :8080 | CI `image` job |
| Graceful shutdown | `docker stop` → logs `shutting down…` then `shutdown complete`, exit code 0 | CI `image` job; local |

## 4. Issues found during verification

- **Publish digest lookup bug (fixed).** In [run 39146198248](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39146198248),
  the push of `:c7ea99b…` succeeded (`digest: sha256:e90d1d34…`, after all checks had passed),
  but the job then failed: Docker stores Docker Hub names without `docker.io/` in `RepoDigests`.
  Fixed in commit `e0cb1bf` by reading the digest from the `docker push` output; run 39146538496
  shows the fix working. The `:c7ea99b…` tag stays on Docker Hub; nothing deployed it.
- **DigitalOcean credentials are invalid.** The old `cd.yml` on `main` has no branch filter, so
  it fired when this branch's CI finished. [Run 39146453828](https://github.com/Ajai-Sharan/bmi-calculator-ci-cd/actions/runs/39146453828)
  failed at `doctl`: `Validating token... ✗ Error: Unable to use supplied token to access API
  status 401`. Nothing was applied to any cluster. The new `cd.yml` filters on `main` and on push
  events, and is opt-in via `ENABLE_DO_DEPLOY`. Because `workflow_run` always uses the
  default branch's file, the old trigger behaviour lasts until this PR is merged.

## Limitations

- **Cloud deployment not verified.** The Kubernetes evidence comes from an ephemeral kind
  cluster in GitHub Actions. That is a real cluster, but it is deleted after the job. The
  DigitalOcean path in `cd.yml` has not run successfully in this work because the stored
  token returns 401, and whether the cluster still exists is unknown.
- **Nothing merged to `main`.** The automatic `push`-to-`main` path (publish, then move `latest`,
  then CD) is therefore unexercised. The same publish and deploy steps ran through
  `workflow_dispatch`.
- **Dependency-Check database freshness.** The action runs with `--noupdate` and uses the
  vulnerability data bundled in its image, so its SCA coverage is only as fresh as that image.
  `npm audit` and Trivy query current advisory data and back it up.
- **Dev-only advisories remain.** `npm audit` (all deps) still reports advisories in transitive
  Jest/ESLint tooling (e.g. `brace-expansion`, `sprintf-js`). These are build-time only and not
  in the image (Trivy scans the image's node_modules: 0 findings).
- **Observability scope.** No Prometheus/Grafana or tracing backend was deployed. Metrics were
  verified by scraping the endpoint, and traces were verified as correlated span log lines.
  Alerting rules and SLO targets in the README are examples, not deployed alerts.
- **Not implemented:** NetworkPolicy, HPA, image signing/SBOM attestation, multi-node placement.
- `kubectl rollout undo` warns that the `last-applied-configuration` annotation is not updated.
  This is why the README prefers redeploying a known SHA for a tracked rollback.
- In jobs that use the Docker Hub secret, the log masks the account name as `***`, because the
  username is stored as a secret.
