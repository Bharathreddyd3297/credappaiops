# =====================================================================
# CREDPAY Customer Portal - React single-page app served by nginx
# =====================================================================
# Build once, run anywhere: the API and Keycloak addresses are NOT baked
# into the build. They come from CREDPAY_* environment variables when the
# container starts (docker/40-runtime-config.sh writes /config.js).
#
#   docker build -t credpay/customer-portal .
#   docker run -p 5173:8080 -e CREDPAY_USER_API_URL=http://localhost:8080 ... credpay/customer-portal
# =====================================================================

# ---- Stage 1: build the static site ---------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first (cached unless package*.json change)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Stage 2: serve with unprivileged nginx --------------------------
# nginx-unprivileged runs as user 101 and listens on 8080 (no root needed)
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

USER 101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
