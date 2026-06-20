/**
 * Wires Socket.IO events to RoomManager/Room commands. Every command validates
 * server-side and replies through an ack so the client gets deterministic
 * success/failure (e.g. a clue rejected for containing a letter emoji).
 */
import type { Server, Socket } from 'socket.io';
import type {
  Ack,
  AckResult,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@moji/shared';
import type { RoomManager } from '../rooms/RoomManager.js';

type Io = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function ok<T>(ack: Ack<T>, data: T): void {
  (ack as (r: AckResult<T>) => void)({ ok: true, data });
}
function fail(ack: (r: AckResult<never>) => void, err: unknown): void {
  ack({ ok: false, error: err instanceof Error ? err.message : 'Unexpected error' });
}

export function registerSocketHandlers(io: Io, manager: RoomManager): void {
  io.on('connection', (socket: AppSocket) => {
    socket.on('room:join', (payload, ack) => {
      try {
        const { room, playerId, sessionToken } = manager.join(socket.id, payload);
        socket.data.playerId = playerId;
        socket.data.roomCode = room.code;
        socket.join(manager.socketRoomName(room.code));
        ok(ack, { code: room.code, playerId, sessionToken });
        // Push an authoritative snapshot now that the socket is bound + joined.
        manager.onStateChange(room);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('room:configure', (payload, ack) => {
      try {
        manager.command(socket.id, (room, pid) => room.configure(pid, payload));
        ok(ack, undefined);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('player:ready', (ready, ack) => {
      try {
        manager.command(socket.id, (room, pid) => room.setReady(pid, ready));
        ok(ack, undefined);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('game:start', (ack) => {
      try {
        manager.command(socket.id, (room, pid) => room.start(pid));
        ok(ack, undefined);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('clue:submit', (payload, ack) => {
      try {
        manager.command(socket.id, (room, pid) => room.submitClue(pid, payload.emojis));
        ok(ack, undefined);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('guess:submit', (payload, ack) => {
      try {
        const res = manager.command(socket.id, (room, pid) => room.submitGuess(pid, payload.text));
        ok(ack, res);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('host:skip', (ack) => {
      try {
        manager.command(socket.id, (room, pid) => room.hostSkip(pid));
        ok(ack, undefined);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('host:next', (ack) => {
      try {
        manager.command(socket.id, (room, pid) => room.hostNext(pid));
        ok(ack, undefined);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('room:leave', (ack) => {
      manager.leave(socket.id);
      ok(ack, undefined);
    });

    socket.on('disconnect', () => {
      manager.handleDisconnect(socket.id);
    });
  });
}
