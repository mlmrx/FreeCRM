FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run typecheck && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN mkdir -p /app/.wrangler/state \
  && chown -R node:node /app
COPY --chown=node:node --from=runtime-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/drizzle ./drizzle
COPY --chown=node:node --from=builder /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/wrangler.local.jsonc ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --retries=5 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "./node_modules/.bin/wrangler d1 migrations apply DB --local -c wrangler.local.jsonc --persist-to .wrangler/state && exec ./node_modules/.bin/wrangler dev -c dist/server/wrangler.json --ip 0.0.0.0 --port 3000 --persist-to .wrangler/state --var FREE_CRM_LOCAL_MODE:true"]
