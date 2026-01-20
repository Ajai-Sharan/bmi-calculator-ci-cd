# BMI Calculator API

A lightweight Node.js service that calculates Body Mass Index (BMI) and exposes a health endpoint suitable for containerized and Kubernetes deployments.

- Repository files:
  - [src/server.js](src/server.js) – HTTP API server
  - [src/bmi.js](src/bmi.js) – BMI calculation logic
  - [tests/bmi.test.js](tests/bmi.test.js) – Unit tests
  - [Dockerfile](Dockerfile) – Container build
  - [.github/workflows/ci.yml](.github/workflows/ci.yml) – CI pipeline
  - [.github/workflows/cd.yml](.github/workflows/cd.yml) – CD pipeline
  - [k8/deployment.yml](k8/deployment.yml) – Kubernetes Deployment and Service
  - [package.json](package.json) – Project metadata and scripts
  - [eslint.config.js](eslint.config.js) – Lint configuration

## Problem Background & Motivation
BMI is a widely used metric to estimate body fat and associated health risk. Automating BMI computation in a small HTTP service supports integrations, containerized deployments, and demos of secure CI/CD.

BMI formula: $BMI=\dfrac{weight_{kg}}{height_{m}^2}$

## Application Overview
- Core logic: [src/bmi.js](src/bmi.js) computes BMI.
- Server: [src/server.js](src/server.js) exposes a health check at `/health` used by CI runtime tests and Kubernetes probes.
- Tests: [tests/bmi.test.js](tests/bmi.test.js) validate BMI calculations.
- Containerization: [Dockerfile](Dockerfile) builds a production image.
- Deployment: [k8/deployment.yml](k8/deployment.yml) deploys as a `Deployment` with `Service` on port 80 → 3000.

## CI/CD Workflow Diagram
- CI: [.github/workflows/ci.yml](.github/workflows/ci.yml)
  - Trigger: push to `main` or manual dispatch
  - Steps:
    - Checkout → Setup Node 20 → `npm ci`
    - Unit tests → Lint
    - OWASP Dependency-Check (SCA) with SARIF upload
    - CodeQL (SAST): init → autobuild → analyze
    - Docker build image `DOCKERHUB_USERNAME/bmi-calculator-api:latest`
    - Trivy image scan (CRITICAL, ignore-unfixed) with SARIF upload
    - Docker login → push
    - Runtime smoke test: run container → `curl http://localhost:3000/health`
- CD: [.github/workflows/cd.yml](.github/workflows/cd.yml)
  - Trigger: on successful completion of “BMI CALCULATOR CI”
  - Steps:
    - Install `doctl` → save kubeconfig
    - Install `kubectl`
    - `kubectl apply -f` [k8/deployment.yml](k8/deployment.yml)
    - `kubectl rollout status` verify deployment

ASCII flow:
- Developer push → CI
  → Build/Tests/Lint
  → SCA + SAST
  → Docker build + Trivy
  → Push image + Smoke test
  → Success → CD
  → kubeconfig + kubectl apply
  → Rollout verified

## Security & Quality Controls
- Linting via [eslint.config.js](eslint.config.js)
- Unit tests in [tests/bmi.test.js](tests/bmi.test.js)
- SCA: OWASP Dependency-Check (fail on CVSS ≥ 7)
- SAST: CodeQL for JavaScript
- Container scan: Trivy (CRITICAL, ignore-unfixed)
- Runtime checks:
  - CI smoke test with `/health`
  - Kubernetes liveness/readiness probes in [k8/deployment.yml](k8/deployment.yml)
- Resource controls: requests/limits configured in [k8/deployment.yml](k8/deployment.yml)

## Results & Observations
- CI blocks on failing tests or lint errors.
- Security findings (SCA/SAST/Trivy) are uploaded to GitHub Security as SARIF.
- Image is pushed only after successful build and basic runtime validation.
- CD applies the latest manifest and waits for a healthy rollout.

## Limitations & Improvements
- Expand tests to cover edge cases and API responses.
- Add integration/E2E tests and contract tests.
- Introduce versioned image tags and environments (staging/production).
- Enable HPA, PodSecurity standards, and network policies.
- Sign images (cosign) and generate SBOM (Syft).
- Improve Trivy policy to include HIGH/MEDIUM severities.
- Use GitHub Environments with required approvals.

## Final Conclusion
The project demonstrates a secure, automated pipeline from code → tested container → scanned image → Kubernetes rollout, using health checks and resource controls to maintain reliability.

## Steps to Run It in a Repository
- Prerequisites: Node.js 20+, Docker, kubectl (optional), access to a Kubernetes cluster (optional).
- Local:
  - Install: `npm ci`
  - Test: `npm test`
  - Lint: `npm run lint`
  - Run: `node src/server.js`
  - Health: `curl http://localhost:3000/health`
- Docker:
  - Build: `docker build -t youruser/bmi-calculator-api:latest .`
  - Run: `docker run -p 3000:3000 -e PORT=3000 youruser/bmi-calculator-api:latest`
- Kubernetes:
  - Ensure kubeconfig is set (via `doctl` or your provider)
  - Deploy: `kubectl apply -f k8/deployment.yml`
  - Check: `kubectl rollout status deployment.apps/bmi-calculator-api`

## Secrets Configuration
Set GitHub Actions secrets in repository settings:
- `DOCKERHUB_USERNAME` – Docker Hub username
- `DOCKERHUB_TOKEN` – Docker Hub access token
- `DIGITALOCEAN_ACCESS_TOKEN` – DigitalOcean API token
- `DIGITALOCEAN_CLUSTER_NAME` – Target Kubernetes cluster name

Note: CD expects CI workflow name to be exactly “BMI CALCULATOR CI” as used in [.github/workflows/cd.yml](.github/workflows/cd.yml).

## CI Explanation
- Workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml)
  - Checkout and Node setup (v20, npm cache)
  - `npm ci` for clean dependency install
  - `npm test` to run unit tests from [tests/bmi.test.js](tests/bmi.test.js)
  - `npm run lint` using [eslint.config.js](eslint.config.js)
  - OWASP Dependency-Check with SARIF upload
  - CodeQL init/autobuild/analyze for JavaScript
  - Docker build via [Dockerfile](Dockerfile)
  - Trivy image scan with SARIF upload
  - Docker login and push to `DOCKERHUB_USERNAME/bmi-calculator-api:latest`
  - Runtime smoke test via `/health` endpoint

## CD Explanation
- Workflow: [.github/workflows/cd.yml](.github/workflows/cd.yml)
  - Triggered by successful CI run
  - Retrieves kubeconfig via `doctl`
  - Applies [k8/deployment.yml](k8/deployment.yml)
  - Verifies rollout with `kubectl rollout status`