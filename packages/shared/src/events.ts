/**
 * Socket.IO event contracts. These types are used on both ends to get a
 * fully-typed Socket.IO server and client.
 *
 * Convention:
 *   - client → server events are commands (imperative), and use ack callbacks.
 *   - server → client events are state pushes / notifications.
 */

import type { GuessResult, PublicGuess, RoomView } from './types.js';

/** Standard ack shape for commands. */
export type Ack<T = void> = (res: AckResult<T>) => void;

export type AckResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export interface JoinRoomPayload {
  /** omit/empty to create a new room */
  code?: string;
  displayName: string;
  /** chosen emoji avatar */
  avatar?: string;
  asSpectator?: boolean;
  /** reconnection token from a previous session, if any */
  sessionToken?: string;
}

export interface JoinRoomResult {
  code: string;
  playerId: string;
  sessionToken: string;
}

export interface ConfigureRoomPayload {
  rounds?: number;
  clueCreationSeconds?: number;
  guessingSeconds?: number;
  packSlug?: string;
}

export interface SubmitCluePayload {
  emojis: string[];
}

export interface SubmitGuessPayload {
  text: string;
}

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  'room:join': (payload: JoinRoomPayload, ack: Ack<JoinRoomResult>) => void;
  'room:leave': (ack: Ack) => void;
  'room:configure': (payload: ConfigureRoomPayload, ack: Ack) => void;
  'player:ready': (ready: boolean, ack: Ack) => void;
  'game:start': (ack: Ack) => void;
  /** swap your prompt for a different one (once per round) */
  'clue:reshuffle': (ack: Ack) => void;
  'clue:submit': (payload: SubmitCluePayload, ack: Ack) => void;
  'guess:submit': (payload: SubmitGuessPayload, ack: Ack<GuessResult>) => void;
  'host:skip': (ack: Ack) => void;
  'host:next': (ack: Ack) => void;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  /** Full role-filtered snapshot. Sent on join, reconnect, and after changes. */
  'room:state': (view: RoomView) => void;
  /** A new guess landed on the active clue (for everyone's live feed). */
  'guess:new': (guess: PublicGuess) => void;
  /** Host changed (e.g. migration). */
  'host:changed': (hostId: string) => void;
  /** Recoverable/informational error not tied to a specific command ack. */
  error: (message: string) => void;
}

// Reserved for inter-server events once we scale out (Redis adapter).
export interface InterServerEvents {}

/** Per-socket data the server attaches after auth/join. */
export interface SocketData {
  playerId?: string;
  roomCode?: string;
}
