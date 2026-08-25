/**
 * Server entrypoint: HTTP + Socket.IO. In production this single process also
 * serves the built React client (single-container deploy behind a Cloudflare
 * Tunnel). In development the client runs on Vite (:5173) and proxies here.
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@moji/shared';
import { env } from './env.js';
import { db } from './db/client.js';
import { migrateAndSeed } from './db/bootstrap.js';
import { ContentProvider } from './content/ContentProvider.js';
import { InMemoryRoomStore } from './rooms/RoomStore.js';
import { SocketIoBroadcaster } from './realtime/Broadcaster.js';
import { RoomManager } from './rooms/RoomManager.js';
import { registerSocketHandlers } from './realtime/handlers.js';
import { landingMeta, normalizeRoomCode, renderShell, roomMeta } from './realtime/og.js';
import { persistCompletedGame } from './persistence.js';
import { weeklyStats } from './stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = process.env.CLIENT_DIST ?? path.resolve(__dirname, '../../client/dist');

async function main() {
  const app = express();
  const httpServer = createServer(app);

  const corsOrigin = env.isProd
    ? env.publicOrigin
    : [env.publicOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'];

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    { cors: { origin: corsOrigin, methods: ['GET', 'POST'] } },
  );

  // Database: apply migrations + seed content on boot (non-fatal).
  if (env.autoMigrate) await migrateAndSeed();

  // Content (reads from the DB; falls back to the bundled set if unavailable).
  const content = new ContentProvider(db);
  await content.load();

  // Seams + manager
  const store = new InMemoryRoomStore();
  const broadcaster = new SocketIoBroadcaster(io);
  const manager = new RoomManager(store, broadcaster, content, persistCompletedGame);
  registerSocketHandlers(io, manager);

  // Health + simple ops endpoints
  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: store.count() }));

  // Public counters for the landing page. Cached in-process; a DB outage
  // returns nulls rather than an error, because a stat must never be the
  // reason the front page fails to render.
  app.get('/api/stats', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await weeklyStats());
  });

  // Serve the built client (production single-container). In dev, Vite serves it.
  if (existsSync(CLIENT_DIST)) {
    const shellPath = path.join(CLIENT_DIST, 'index.html');
    const shell = readFileSync(shellPath, 'utf8');

    // `index: false` matters: without it express.static answers `/` with the
    // raw file and never reaches the handlers below, so the landing page would
    // ship whatever origin is hard-coded in the shell.
    app.use(express.static(CLIENT_DIST, { index: false }));

    // A room link is the game's only marketing surface — give the crawler a
    // card with the live player count on it. Registered BEFORE the catch-all.
    app.get('/r/:code', (req, res) => {
      const code = normalizeRoomCode(req.params.code ?? '');
      const room = code ? store.get(code) : undefined;
      const players = room
        ? room.getSnapshot().players.filter((p) => p.role === 'player').length
        : null;
      // The count is live and rooms are short-lived, so this must not be cached
      // anywhere — a CDN holding "4 players waiting" for a room that ended an
      // hour ago is worse than no card at all.
      res.set('Cache-Control', 'no-store');
      res.type('html').send(renderShell(shell, roomMeta(env.publicOrigin, code, players)));
    });

    app.get('*', (_req, res) => {
      res.type('html').send(renderShell(shell, landingMeta(env.publicOrigin)));
    });
    console.log(`[http] serving client from ${CLIENT_DIST}`);
  } else {
    console.log('[http] no client build found; run the Vite dev server for the UI.');
  }

  httpServer.listen(env.port, () => {
    console.log(`[moji] listening on :${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
