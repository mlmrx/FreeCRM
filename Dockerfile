FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/.wrangler/state \
  && chown -R node:node /app
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/drizzle ./drizzle
COPY --chown=node:node --from=builder /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/wrangler.local.jsonc ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --retries=5 CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["sh", "-c", "npx wrangler d1 migrations apply DB --local -c wrangler.local.jsonc --persist-to .wrangler/state && npx wrangler dev -c dist/server/wrangler.json --ip 0.0.0.0 --port 3000 --persist-to .wrangler/state --var FREE_CRM_LOCAL_MODE:true"]
