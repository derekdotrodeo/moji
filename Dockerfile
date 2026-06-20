# syntax=docker/dockerfile:1

# ── Build stage: install workspaces, build shared + client + server ──
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps first (better layer caching). Lockfile is required by `npm ci`.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci

# Build everything: shared -> client -> server
COPY . .
RUN npm run build

# Drop devDependencies so only runtime deps ship in the final image.
RUN npm prune --omit=dev

# ── Runtime stage: single process serves API + built client ──
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Tell the server where the built client lives (see server/src/index.ts).
ENV CLIENT_DIST=/app/packages/client/dist

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/client/dist ./packages/client/dist
# NOTE: DB migrations are run as an ops step from a dev checkout
# (`npm run db:migrate`), not from this runtime image.

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
