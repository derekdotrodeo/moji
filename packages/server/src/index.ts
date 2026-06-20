/**
 * Server entrypoint: HTTP + Socket.IO. In production this single process also
 * serves the built React client (single-container deploy behind a Cloudflare
 * Tunnel). In development the client runs on Vite (:5173) and proxies here.
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
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
import { ContentProvider } from './content/ContentProvider.js';
import { InMemoryRoomStore } from './rooms/RoomStore.js';
import { SocketIoBroadcaster } from './realtime/Broadcaster.js';
import { RoomManager } from './rooms/RoomManager.js';
import { registerSocketHandlers } from './realtime/handlers.js';
import { persistCompletedGame } from './persistence.js';

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

  // Content
  const content = new ContentProvider(db);
  await content.load();

  // Seams + manager
  const store = new InMemoryRoomStore();
  const broadcaster = new SocketIoBroadcaster(io);
  const manager = new RoomManager(store, broadcaster, content, persistCompletedGame);
  registerSocketHandlers(io, manager);

  // Health + simple ops endpoints
  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: store.count() }));

  // Serve the built client (production single-container). In dev, Vite serves it.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
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
