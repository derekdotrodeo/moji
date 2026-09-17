# Moji

Real-time multiplayer party game: players craft emoji clues for secret prompts and race to guess
each other's.

- [`CLAUDE.md`](CLAUDE.md) — design invariants and the decisions behind them. Read this before
  changing game rules, scoring, or anything the serializer touches.
- [`docs/content-guidelines.md`](docs/content-guidelines.md) — how prompts and packs are stored, and
  what makes a prompt worth adding.
- [`docs/case-study-brief.md`](docs/case-study-brief.md) — a written-up tour of the project for
  external readers.

The original design doc (`i-want-to-build-dazzling-lemon.md`) is not in this repo; code comments
still cite its sections (§3 state machine, §5 persistence, §6 dealing, §7 rules & anti-cheat).

## How it plays

A host creates a room, everyone joins with a 5-character code or the `/r/CODE` link, and each round
runs: every player is dealt a **secret prompt** from a content pack, builds a clue from **1–10
emoji**, then the room plays the clues back one at a time and races to guess each.

- **Scoring** — guessers get 1000 points decaying to 150 across the guess window; authors are paid
  per solver, weighted by how long that solve took, so the most literal clue is not the best one.
- **Packs** — 17 of them. The pack name is shown to guessers as their one free hint. `packMode`
  is `shared` (one pack for the round) or `mixed` (every player draws from a different pack).
- **Prompt swaps** — 3 per round, 150 points each, so a swap is a real choice.
- **Letter hints** — blanks fill in during the guess window, planned and ticked server-side.
- **Solving** — gets you the answer, a side channel with the other solvers, and a bump to pay the
  author.

Defaults: 3 rounds, 60s to build a clue, 30s to guess each one. 2 players minimum, built for 4–10.

### Solo (vs Mojibot)

`/solo`, or the link under the buttons on the landing page: one human against a bot, no lobby, two
rounds, about four minutes. The bot is a **headless client** — it is handed the same role-filtered
`RoomView` a browser gets and issues the same commands, so it cannot see the answer to your clue and
has to genuinely guess it from your emoji and the pack name. How sure it is sets *when* it guesses,
so a literal clue gets cracked early and earns you very little. It plays hand-written clues
(`server/src/content/database/bot-clues.ts`) and rounds are dealt only from prompts that library
covers. See `server/src/bots/`.

## Stack

- **Client** — React + TypeScript + Vite + Tailwind (`packages/client`)
- **Server** — Node + TypeScript + Express + Socket.IO (`packages/server`)
- **Shared** — event contracts, domain types, scoring, hints, emoji rules (`packages/shared`)
- **DB** — PostgreSQL via Drizzle ORM
- **Tests** — Vitest, run from the repo root across all workspaces
- **Deploy** — single Docker image (server serves the built client) behind a Cloudflare Tunnel

The server is authoritative. Live room state is in memory for the MVP, behind a `RoomStore` seam so
it can move to Redis later. Everything sent to a client goes through the role-filtered serializer in
`packages/server/src/realtime/serialize.ts`. See `packages/server/src/rooms/` and
`packages/server/src/realtime/`.

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

Open http://localhost:5173 during development (Vite proxies socket/API traffic to the server on
:3000).

The server applies migrations and seeds content on boot by default (`AUTO_MIGRATE=false` to manage
that externally), and `ContentProvider` falls back to the bundled prompt set when the database is
empty or unreachable — so the game runs even with no Postgres at all. Only completed-game records
need the database.

## Production-style run (single container)

```bash
docker compose up --build moji   # builds client + server into one image, serves on :3000
```

Add the Cloudflare Tunnel by setting `CLOUDFLARE_TUNNEL_TOKEN` in `.env` and running:

```bash
docker compose --profile tunnel up -d
```

Point the tunnel's public hostname at `http://moji:3000` and enable WebSockets. Set `PUBLIC_ORIGIN`
to the real origin: it drives CORS and the `og:url`/`og:image` tags stamped into the HTML shell, so
a domain move needs no code change.

## HTTP endpoints

Everything else is Socket.IO. See `packages/shared/src/events.ts` for the event contract.

| Route | What it serves |
|---|---|
| `/healthz` | liveness + live room count |
| `/api/stats` | public counters for the landing page (nulls when the DB is down) |
| `/r/:code` | the app shell with live Open Graph tags for that room (`Cache-Control: no-store`) |
| `/solo` | the app shell; the client deals a game against the bot on load |
| `*` | the app shell with origin-corrected Open Graph tags |

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
  shared/   # @moji/shared — types, socket events, scoring, hints, emoji rules
  server/   # @moji/server — http + socket.io, state machine, content, bots, db, seams
  client/   # @moji/client — react app
docs/                  # content guidelines, case-study brief
Dockerfile             # multi-stage: build client+server, run server
docker-compose.yml     # db + moji server (+ cloudflared profile)
```
