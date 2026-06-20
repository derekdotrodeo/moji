/**
 * Owns the room lifecycle and the socket<->player binding, and fans authoritative
 * state out to clients via the Broadcaster using the role-filtered serializer.
 *
 * This is the integration point for the seams: RoomStore (where state lives),
 * Broadcaster (how messages ship), ContentProvider (prompt dealing). Swapping
 * any of them for a scaled-out implementation does not touch game logic.
 */
import { DEFAULT_SCORING, type JoinRoomPayload, type PublicGuess } from '@moji/shared';
import type { Broadcaster } from '../realtime/Broadcaster.js';
import { serializeRoomFor } from '../realtime/serialize.js';
import { issueSessionToken, verifySessionToken } from '../auth/session.js';
import { generateRoomCode } from '../game/codes.js';
import type { ContentProvider } from '../content/ContentProvider.js';
import { Room, type RoomHooks } from './Room.js';
import type { RoomStore } from './RoomStore.js';

const DISCONNECT_GRACE_MS = 60_000;

export interface JoinOutcome {
  room: Room;
  playerId: string;
  sessionToken: string;
}

export class RoomManager implements RoomHooks {
  private playerToSocket = new Map<string, string>();
  private socketToPlayer = new Map<string, { roomCode: string; playerId: string }>();
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private persistedGames = new Set<string>();

  constructor(
    private readonly store: RoomStore,
    private readonly broadcaster: Broadcaster,
    private readonly content: ContentProvider,
    private readonly persistGame: (room: Room) => Promise<void>,
  ) {}

  private newRoom(code: string): Room {
    return new Room(code, {
      content: this.content,
      scoring: DEFAULT_SCORING,
      rng: Math.random,
      hooks: this,
    });
  }

  join(socketId: string, payload: JoinRoomPayload): JoinOutcome {
    const displayName = sanitizeName(payload.displayName);
    const requestedCode = payload.code?.toUpperCase();

    // Reconnection: rebind ONLY when the player is explicitly re-entering the
    // SAME room their token is for (e.g. rejoin-by-code after a refresh). A
    // create (no code) or a different code must NOT resurrect the old room —
    // otherwise finishing a game and hitting "Create" drops you back into the
    // old room's final leaderboard.
    const token = verifySessionToken(payload.sessionToken);
    if (token && requestedCode && requestedCode === token.roomCode) {
      const room = this.store.get(token.roomCode);
      if (room && room.hasPlayer(token.playerId)) {
        this.cancelGrace(token.playerId);
        room.setConnection(token.playerId, 'CONNECTED');
        this.bind(socketId, room.code, token.playerId);
        return {
          room,
          playerId: token.playerId,
          sessionToken: issueSessionToken(token.playerId, room.code),
        };
      }
    }

    // Create or look up the room.
    let room: Room;
    if (requestedCode) {
      const found = this.store.get(requestedCode);
      if (!found) throw new Error('Room not found.');
      room = found;
    } else {
      const code = generateRoomCode((c) => this.store.has(c));
      room = this.newRoom(code);
      this.store.set(room);
    }

    const role = payload.asSpectator ? 'spectator' : 'player';
    const player = room.addPlayer(displayName, role, payload.avatar || '😎');
    this.bind(socketId, room.code, player.id);
    return {
      room,
      playerId: player.id,
      sessionToken: issueSessionToken(player.id, room.code),
    };
  }

  command<T>(socketId: string, fn: (room: Room, playerId: string) => T): T {
    const binding = this.socketToPlayer.get(socketId);
    if (!binding) throw new Error('Join a room first.');
    const room = this.store.get(binding.roomCode);
    if (!room) throw new Error('Room no longer exists.');
    return fn(room, binding.playerId);
  }

  leave(socketId: string): void {
    const binding = this.socketToPlayer.get(socketId);
    if (!binding) return;
    const room = this.store.get(binding.roomCode);
    this.unbind(socketId);
    room?.removePlayer(binding.playerId);
  }

  /** Socket dropped: keep the slot for a grace period, then remove. */
  handleDisconnect(socketId: string): void {
    const binding = this.socketToPlayer.get(socketId);
    if (!binding) return;
    const { roomCode, playerId } = binding;
    this.socketToPlayer.delete(socketId);
    if (this.playerToSocket.get(playerId) === socketId) this.playerToSocket.delete(playerId);

    const room = this.store.get(roomCode);
    if (!room) return;
    room.setConnection(playerId, 'DISCONNECTED');
    this.cancelGrace(playerId);
    this.graceTimers.set(
      playerId,
      setTimeout(() => {
        this.graceTimers.delete(playerId);
        const r = this.store.get(roomCode);
        // Only remove if they didn't reconnect to another socket meanwhile.
        if (r && !this.playerToSocket.has(playerId)) r.removePlayer(playerId);
      }, DISCONNECT_GRACE_MS),
    );
  }

  // ── RoomHooks ──────────────────────────────────────────────────────────────
  onStateChange(room: Room): void {
    const snap = room.getSnapshot();
    for (const player of snap.players) {
      const socketId = this.playerToSocket.get(player.id);
      if (socketId) this.broadcaster.toSocket(socketId, 'room:state', serializeRoomFor(snap, player.id));
    }
    if (snap.phase === 'GAME_RESULTS' && !this.persistedGames.has(room.code)) {
      this.persistedGames.add(room.code);
      this.persistGame(room).catch((err) => console.error('[persist] game failed:', err));
    }
  }

  onGuess(room: Room, guess: PublicGuess): void {
    // Already public-safe (correct guesses are blanked in Room.submitGuess).
    this.broadcaster.toRoom(room.code, 'guess:new', guess);
  }

  onClosed(room: Room): void {
    this.persistedGames.delete(room.code);
    this.store.delete(room.code);
  }

  // ── binding helpers ──────────────────────────────────────────────────────
  private bind(socketId: string, roomCode: string, playerId: string): void {
    this.playerToSocket.set(playerId, socketId);
    this.socketToPlayer.set(socketId, { roomCode, playerId });
  }

  private unbind(socketId: string): void {
    const binding = this.socketToPlayer.get(socketId);
    if (binding && this.playerToSocket.get(binding.playerId) === socketId) {
      this.playerToSocket.delete(binding.playerId);
    }
    this.socketToPlayer.delete(socketId);
  }

  private cancelGrace(playerId: string): void {
    const t = this.graceTimers.get(playerId);
    if (t) {
      clearTimeout(t);
      this.graceTimers.delete(playerId);
    }
  }

  /** Socket.IO room name a socket should join for room-wide broadcasts. */
  socketRoomName(roomCode: string): string {
    return roomCode;
  }
}

function sanitizeName(name: string): string {
  const trimmed = (name ?? '').trim().slice(0, 20);
  // TODO(moderation §8): run against moderation_blocklist (leetspeak-normalized).
  return trimmed || 'Player';
}
