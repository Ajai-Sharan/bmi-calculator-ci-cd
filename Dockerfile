# Node.js 24 LTS (the previous node:18 image is end-of-life)
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies, exactly as locked in package-lock.json.
# Then apply OS security patches and remove npm/yarn, which the running app does not need.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force \
 && apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*

# Copy source code
COPY src/ ./src/

# Git commit SHA of this build (CI passes it with --build-arg); shown by GET /health
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# Run as the built-in unprivileged "node" user (uid 1000) instead of root
USER node

EXPOSE 3000

# Start node directly (not "npm start") so the app receives SIGTERM from Kubernetes
CMD ["node", "src/server.js"]
