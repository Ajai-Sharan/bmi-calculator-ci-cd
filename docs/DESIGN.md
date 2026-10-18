# Design decisions and tradeoffs

A short record of why things are the way they are, and what would change under different needs.

## Workload: a Deployment with 2 replicas
The API is stateless (no database, no files, no session), so a **Deployment** is the right
workload. A StatefulSet adds ordered identity and storage that nothing here uses. Two replicas
plus `maxUnavailable: 0` let one pod be replaced while the other serves, and the PDB keeps one
up during node drains. **What would change:** under variable load, add an HPA on CPU (requests
are set, so the HPA has a baseline). On a multi-node cluster, add a topology spread constraint
so the two replicas land on different nodes.

## Probes: separate liveness and readiness
`/health` (liveness) only says that the process responds. `/ready` (readiness) is false during
start-up and while draining after SIGTERM. Using the same endpoint for both, as the baseline did,
means that on shutdown Kubernetes either keeps routing traffic to a stopping pod or restarts a
healthy one. Neither probe checks dependencies, because there are none. If a database were
added, readiness (not liveness) would check it, so an outage would not cause restart loops.

## Release: rolling update, pinned by commit SHA and digest
Images are tagged with the full commit SHA and deployed **by digest**. Tags on Docker Hub are
mutable, while a digest is content-addressed. Rolling update with readiness gating suits a
single small service. **Blue-green** would give instant switch-back but doubles resources and
needs a traffic switch (a second Service or Ingress). **Canary** needs traffic splitting (an
Ingress controller or service mesh) and enough traffic for metrics to be meaningful. Neither
pays off for this app at this scale. Recovery relies on the readiness gate, automatic
`rollout undo` in `deploy.sh`, and redeploying a known SHA through CD. CI exercises the
automatic undo on every run.

## Configuration: kustomize, not Helm
The only per-deployment variable is the image, plus a few env settings. Kustomize is built into
kubectl, so there is no extra tool or template language, and `configMapGenerator` gives
config-change rollouts for free. The deploy script writes a throwaway overlay rather than
editing committed files, so git never drifts from a deploy. **Helm would be better** with
several environments or many values, or to distribute the chart to others.

## CI/CD boundaries
- **Gate before publish.** Nothing reaches the registry unless tests, lint, audit, CodeQL,
  Dependency-Check, the Trivy gate and the container smoke test all pass. The published image
  is the scanned artifact itself, not a rebuild.
- **Credentials isolation.** Scanners (third-party code) run in jobs without registry or cloud
  secrets. Only the small publish and deploy jobs see secrets.
- **Kubernetes verification in CI (kind).** Every PR and release run deploys to a real,
  disposable Kubernetes cluster, which tests the manifests, probes, security context and
  rollback without paid infrastructure. The tradeoff: it is not long-lived, so it proves the
  release is deployable but does not run it for users.
- **CD to a long-lived cluster** (DigitalOcean, retained from the baseline) runs only for `main`,
  checks out the same commit as the image, and can be gated by required reviewers on the
  `production` environment. It is **opt-in** (`ENABLE_DO_DEPLOY=true`) because the stored cloud
  token is currently rejected. A pipeline that fails on every merge for reasons unrelated to
  the change trains people to ignore red builds. A **pull-based GitOps** tool such as Argo CD would add drift
  detection and self-healing, but it is another controller to run and secure. Push-based CD is
  enough for one service and one cluster.
- **`latest`** is still moved on `main` for backward compatibility with anything pulling it.
  Nothing in this repo deploys it, and `deploy.sh` refuses it.

## Observability: proportionate, standards-based
- **Metrics:** prom-client exposes RED metrics plus a business outcome (`bmi_calculations_total`)
  and `app_info{version}`. They are served on a **separate port** so the public LoadBalancer
  does not expose internal metrics. Prometheus scrapes the pod directly.
- **Logs:** pino JSON to stdout, so the platform's log pipeline needs no parsing rules and every
  line is correlated by `trace_id`.
- **Traces:** the OpenTelemetry SDK with manual spans and W3C propagation, exported as log lines
  instead of to a tracing backend. Auto-instrumentation and an OTLP exporter add many
  dependencies and need a collector, which is too much for a single service with no downstream
  calls. Because the instrumentation is standard OTel, adding an OTLP exporter later changes one
  file.
- **Not included:** a Prometheus/Grafana/Jaeger stack. The brief asks for proportionate
  observability, and running a monitoring stack would be more infrastructure than the app.

## Security choices
- Non-root UID 1000, read-only root filesystem, no capabilities, `RuntimeDefault` seccomp: the
  Pod Security "restricted" profile settings, which the app needs no exceptions from.
- No service-account token: the app never talks to the Kubernetes API.
- npm/yarn are removed from the runtime image. They are the most common source of Trivy
  findings in Node images and are unused at runtime.
- Trivy gates on **fixable** HIGH/CRITICAL only. Gating on unfixed CVEs would block releases
  with no available action. All severities are still reported to GitHub Security.
- **Not done yet:** NetworkPolicy (needs an enforcing CNI to verify; kind's default CNI was not
  relied on), image signing (cosign) and SBOM attestation, and a stricter Dependency-Check NVD
  API key setup.

## Validation
The input ranges (weight 1–700 kg, height 0.3–3 m) are deliberately wide. They reject unit
mistakes (centimetres) and garbage without second-guessing real adults. BMI categories follow
the WHO adult bands with exclusive upper bounds, which fixes the baseline's gaps.
