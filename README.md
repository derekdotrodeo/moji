# Moji

Real-time multiplayer party game: players craft emoji clues for secret prompts and race to guess each other's. See the design doc in `/Users/derek/.claude/plans/i-want-to-build-dazzling-lemon.md`.

## Stack

- **Client** — React + TypeScript + Vite + Tailwind (`packages/client`)
- **Server** — Node + TypeScript + Express + Socket.IO (`packages/server`)
- **Shared** — event contracts, domain types, scoring, emoji rules (`packages/shared`)
- **DB** — PostgreSQL via Drizzle ORM
- **Deploy** — single Docker image (server serves the built client) behind a Cloudflare Tunnel

The server is authoritative. Live room state is in memory for the MVP, behind a `RoomStore` seam so it can move to Redis later. See `packages/server/src/rooms/` and `packages/server/src/realtime/`.

## Prerequisites

- Node 20+
- Docker (for Postgres locally, and for the production image)

## Local development

```bash
cp .env.example .env            # then edit SESSION_SECRET
docker compose up -d db         # Postgres on :5432
npm install
npm run db:migrate              # apply schema
npm run db:seed                 # load starter categories + prompts
npm run dev                     # server :3000, vite client :5173 (proxied to server)
```

Open http://localhost:5173 during development (Vite proxies socket/API traffic to the server on :3000).

## Production-style run (single container)

```bash
docker compose up --build moji   # builds client + server into one image, serves on :3000
```

Add the Cloudflare Tunnel by setting `CLOUDFLARE_TUNNEL_TOKEN` in `.env` and running:

```bash
docker compose --profile tunnel up -d
```

## Workspace scripts

| Command | What it does |
|---|---|
| `npm run dev` | Build shared, then run server + client dev servers concurrently |
| `npm run build` | Build shared → client → server |
| `npm run typecheck` | Typecheck all workspaces |
| `npm test` | Run the Vitest suite once (CI) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run db:generate` | Generate a Drizzle migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed categories + prompts |
| `npm start` | Run the built server (serves the built client) |

## Layout

```
packages/
  shared/   # @moji/shared — types, socket events, scoring, emoji rules
  server/   # @moji/server — http + socket.io, state machine, db, seams
  client/   # @moji/client — react app
Dockerfile             # multi-stage: build client+server, run server
docker-compose.yml     # db + moji server (+ cloudflared profile)
```
