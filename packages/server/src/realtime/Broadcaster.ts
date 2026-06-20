/**
 * Broadcaster seam (design doc §4 / Appendix B). Abstracts "how a message
 * reaches clients" so cross-node fan-out (Socket.IO Redis adapter) can drop in
 * later. Today it's a thin wrapper over the local Socket.IO server.
 */
import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@moji/shared';

type Io = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface Broadcaster {
  /** Send to a single connected socket (used for per-recipient state views). */
  toSocket<E extends keyof ServerToClientEvents>(
    socketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  /** Send to everyone in a Socket.IO room (used for already-public payloads). */
  toRoom<E extends keyof ServerToClientEvents>(
    room: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
}

export class SocketIoBroadcaster implements Broadcaster {
  constructor(private readonly io: Io) {}

  toSocket<E extends keyof ServerToClientEvents>(
    socketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.io.to(socketId).emit(event, ...args);
  }

  toRoom<E extends keyof ServerToClientEvents>(
    room: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.io.to(room).emit(event, ...args);
  }
}
