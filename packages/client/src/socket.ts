import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@moji/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same-origin: dev proxies /socket.io to the server via Vite; prod serves both
// from one container. Override with VITE_SERVER_URL if you split them.
const url = import.meta.env.VITE_SERVER_URL || undefined;

export const socket: AppSocket = io(url, { autoConnect: true });

/** Promise wrapper around an ack-based command. */
export function emitAck<T = void>(
  event: keyof ClientToServerEvents,
  payload?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = (res: { ok: true; data: T } | { ok: false; error: string }) => {
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error));
    };
    if (payload === undefined) (socket.emit as any)(event, cb);
    else (socket.emit as any)(event, payload, cb);
  });
}
