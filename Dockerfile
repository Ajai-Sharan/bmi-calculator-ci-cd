# Node.js 24 LTS on Alpine, pinned by digest so every build starts from the
# same bytes. Dependabot proposes digest updates (.github/dependabot.yml).
ARG NODE_IMAGE=node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

# ---- Stage 1: install production dependencies exactly as locked ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- Stage 2: minimal runtime ----
FROM ${NODE_IMAGE}

# Commit SHA baked in at build time; reported by /health and the app_info metric.
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="bmi-calculator-api" \
      org.opencontainers.image.source="https://github.com/Ajai-Sharan/bmi-calculator-ci-cd" \
      org.opencontainers.image.revision="${APP_VERSION}"

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=3000 \
    METRICS_PORT=9464

# Apply OS security patches and remove package managers the runtime never uses.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
# Application files stay root-owned, so the runtime user cannot modify them.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Numeric UID/GID of the image's built-in "node" user, so Kubernetes can verify runAsNonRoot.
USER 1000:1000

# 3000 = API (PORT), 9464 = Prometheus metrics (METRICS_PORT)
EXPOSE 3000 9464

# Run node directly (not via npm) so SIGTERM reaches the app for graceful shutdown.
CMD ["node", "src/server.js"]
