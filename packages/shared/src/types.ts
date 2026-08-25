/**
 * Core domain types shared between client and server.
 *
 * The server is authoritative. Anything sent to clients goes through a
 * role-filtered serializer (see server/src/realtime/serialize.ts) so that, e.g.,
 * a clue's prompt/answer is never present in a non-author's payload.
 */

/** Room lifecycle states. Mirrors the state machine in the design doc (§3). */
export type GamePhase =
  | 'LOBBY'
  | 'ROUND_INTRO'
  | 'PROMPT_ASSIGNMENT'
  | 'CLUE_CREATION'
  | 'CLUE_REVEAL'
  | 'GUESSING'
  | 'CLUE_SCORING'
  | 'ROUND_RESULTS'
  | 'GAME_RESULTS'
  | 'ROOM_CLOSED';

export type PlayerConnection = 'CONNECTED' | 'DISCONNECTED';

export type PlayerRole = 'player' | 'spectator';

export interface Player {
  id: string; // stable player id (carried in the reconnection token)
  displayName: string;
  /** chosen emoji avatar (design: Join screen avatar picker) */
  avatar: string;
  isHost: boolean;
  role: PlayerRole;
  connection: PlayerConnection;
  /** lobby ready-up state */
  ready: boolean;
  score: number;
  joinedAt: number;
}

/** A themed, host-selectable content set (design: "Pack 🍿 Movie Night"). */
export interface Pack {
  slug: string;
  name: string;
  emoji: string;
}

export interface RoomConfig {
  rounds: number;
  /** seconds */
  clueCreationSeconds: number;
  /** seconds per clue */
  guessingSeconds: number;
  /** selected content pack; '' = any active content */
  packSlug: string;
  /** prompt swaps each player gets per round; 0 turns the feature off */
  reshuffles: number;
  /** score charged for each prompt swap; 0 makes swapping free */
  reshuffleCost: number;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  rounds: 3, // snappier first games; host can bump to 5 / 8
  clueCreationSeconds: 60,
  guessingSeconds: 30, // design default (20 / [30] / 45)
  packSlug: '',
  reshuffles: 3,
  reshuffleCost: 150, // a swap is a real choice, not a free reroll
};

/** A single emoji clue authored by a player for their secret prompt. */
export interface ClueSubmission {
  authorId: string;
  /** array of unicode emoji grapheme strings, length 1..10 */
  emojis: string[];
  submittedAt: number;
}

/** A guess broadcast to the room (text only; correctness resolved server-side). */
export interface PublicGuess {
  id: string;
  guesserId: string;
  guesserName: string;
  text: string;
  isCorrect: boolean;
  /** finishing rank among correct guessers for this clue (1 = first), if correct */
  solveRank: number | null;
  /** points earned for a correct guess (null when incorrect) */
  points: number | null;
  at: number;
}

/** Private ack returned to the guesser only. */
export interface GuessResult {
  accepted: boolean;
  isCorrect: boolean;
  duplicate: boolean;
  solveRank: number | null;
  reason?: string;
}

export interface CategorySummary {
  slug: string;
  name: string;
}

/**
 * A message in the solvers' side channel for the active clue.
 *
 * ANTI-CHEAT: these are written by players who already know the answer and are
 * very likely to contain it, so they ship under exactly the same rule as the
 * answer itself — see `RoomView.clueChat`.
 */
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  avatar: string;
  text: string;
  at: number;
}

/** One player's solve of the active clue (revealed on the Reveal screen). */
export interface ClueSolve {
  playerId: string;
  displayName: string;
  avatar: string;
  rank: number;
  ms: number;
  points: number;
}

/**
 * The view of a room sent to a specific client. Fields are populated by the
 * server's role-filtered serializer; secret data (your own prompt, answers)
 * appears only when the recipient is entitled to it.
 */
export interface RoomView {
  code: string;
  phase: GamePhase;
  version: number;
  /** server epoch ms at which the current timed phase ends, if any */
  deadlineTs: number | null;
  config: RoomConfig;
  /** content packs the host can choose from (static for the room) */
  packs: Pack[];
  players: Player[];
  hostId: string;
  roundNumber: number;
  /** category for the current round (public) */
  category: CategorySummary | null;

  /** Your own secret prompt for the current round — only set for you. */
  yourPrompt: string | null;
  /** Whether you have submitted your clue this round. */
  youSubmitted: boolean;
  /** Whether you can still swap your prompt this round. */
  youCanReshuffle: boolean;
  /** Prompt swaps you have left this round (config.reshuffles minus used). */
  yourReshufflesLeft: number;

  /** The clue currently being played (during REVEAL/GUESSING/CLUE_SCORING). */
  activeClue: ActiveClueView | null;
  /** Live guess feed for the active clue (most recent last). */
  guessFeed: PublicGuess[];
  /**
   * The solvers' side channel for the active clue. Populated only when the
   * recipient is entitled to the answer (they authored the clue, they solved
   * it, or it has resolved) — empty for anyone still guessing, because these
   * messages routinely name the answer. Same gate as `ActiveClueView.answer`.
   */
  clueChat: ChatMessage[];

  /** Populated during result phases. */
  roundResults: ScoreRow[] | null;
  gameResults: ScoreRow[] | null;
}

export interface ActiveClueView {
  authorId: string;
  authorName: string;
  authorAvatar: string;
  emojis: string[];
  /** Revealed only once the clue resolves (CLUE_SCORING) or to the author. */
  answer: string | null;
  /**
   * Letter blanks for the answer, filling in as the guess window runs
   * (see shared/hints.ts). Null outside GUESSING. Safe to send to everyone:
   * it is capped short of the whole answer, so it never spells it out.
   */
  hint: string | null;
  solvedCount: number;
  eligibleCount: number;
  /** Whether the recipient is the author (and therefore cannot guess). */
  youAreAuthor: boolean;
  /** Who solved it, in finish order (for the Reveal screen). */
  solves: ClueSolve[];
  /** Points awarded to the author for this clue — set at CLUE_SCORING. */
  authorPoints: number | null;
  /** How many players have bumped this clue. */
  bumps: number;
  /** Points the bumps have earned the author so far. */
  bumpPoints: number;
  /** Whether the recipient has already bumped this clue. */
  youBumped: boolean;
  /** Whether the recipient may bump right now (solved it, or it has resolved). */
  youCanBump: boolean;
  /** The recipient's own solve of this clue, if any. */
  yourSolve: ClueSolve | null;
}

export interface ScoreRow {
  playerId: string;
  displayName: string;
  avatar: string;
  totalScore: number;
  guesserPoints: number;
  authorPoints: number;
  /** points charged this round for prompt swaps (a positive number) */
  penaltyPoints: number;
  rank: number;
}
