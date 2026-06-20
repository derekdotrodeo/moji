/**
 * A single game room: authoritative state + the game state machine
 * (design doc §3). All mutations funnel through guarded command methods that
 * validate, mutate, bump `version`, and notify via hooks — there is no other
 * way to change room state, which keeps transitions race-free under the
 * per-room single-threaded event loop.
 *
 * Live game logic intentionally lives here behind clear seams; details (timer
 * lengths, scoring curve, prompt dealing) are config/injected so they can be
 * tuned once designs land without restructuring the flow.
 */
import { nanoid } from 'nanoid';
import {
  DEFAULT_ROOM_CONFIG,
  authorPoints,
  guesserPoints,
  promptHasNumber,
  validateClue,
  type ClueSolve,
  type ConfigureRoomPayload,
  type GamePhase,
  type GuessResult,
  type Pack,
  type Player,
  type PlayerRole,
  type PublicGuess,
  type RoomConfig,
  type ScoreRow,
  type ScoringConfig,
} from '@moji/shared';
import { isCorrectGuess } from '../game/guessMatching.js';
import type { ContentProvider, PromptForPlay } from '../content/ContentProvider.js';
import { promptKey } from '../content/ContentProvider.js';

const MIN_PLAYERS = 2; // design target is 4–10; relaxed for dev/testing
const ROUND_INTRO_MS = 2000; // category banner
const PROMPT_ASSIGNMENT_MS = 3100; // visible secret prompt + 3-2-1-GO (design)
const CLUE_REVEAL_MS = 1500; // brief "get ready" beat before guessing opens
const CLUE_SCORING_MS = 4000; // per-clue reveal/payoff
const ROUND_RESULTS_MS = 10000; // leaderboard auto-advance (design)
const GUESS_MIN_INTERVAL_MS = 500;

export interface RoomHooks {
  onStateChange(room: Room): void;
  onGuess(room: Room, guess: PublicGuess): void;
  onClosed(room: Room): void;
}

export interface RoomDeps {
  content: ContentProvider;
  scoring: ScoringConfig;
  rng: () => number;
  hooks: RoomHooks;
}

interface PlayerState extends Player {
  guesserPointsRound: number;
  authorPointsRound: number;
  lastGuessAt: number;
  guessedThisClue: Set<string>; // normalized guesses, reset per clue
}

interface SolveRecord {
  rank: number;
  ms: number;
  points: number;
}

interface ActiveClue {
  authorId: string;
  revealAt: number;
  solveCounter: number;
  solvers: Map<string, SolveRecord>; // guesserId -> solve record
  authorPoints: number | null; // set at CLUE_SCORING
}

/** Read-only projection consumed by the role-filtered serializer. */
export interface RoomSnapshot {
  code: string;
  phase: GamePhase;
  version: number;
  deadlineTs: number | null;
  config: RoomConfig;
  packs: Pack[];
  hostId: string;
  roundNumber: number;
  category: { slug: string; name: string } | null;
  players: Player[];
  /** playerId -> their secret answer this round */
  assignments: Map<string, string>;
  submittedAuthorIds: Set<string>;
  reshuffledIds: Set<string>;
  active: {
    authorId: string;
    authorName: string;
    authorAvatar: string;
    emojis: string[];
    answer: string;
    solvedCount: number;
    eligibleCount: number;
    solves: ClueSolve[];
    authorPoints: number | null;
  } | null;
  guessFeed: PublicGuess[];
  roundResults: ScoreRow[] | null;
  gameResults: ScoreRow[] | null;
}

export class Room {
  readonly code: string;
  config: RoomConfig = { ...DEFAULT_ROOM_CONFIG };
  phase: GamePhase = 'LOBBY';
  version = 0;
  deadlineTs: number | null = null;
  hostId = '';
  roundNumber = 0;
  category: { slug: string; name: string } | null = null;
  lastActivityAt = Date.now();

  private players = new Map<string, PlayerState>();
  private assignments = new Map<string, PromptForPlay>();
  private clues = new Map<string, string[]>(); // authorId -> emojis
  private usedPromptKeys = new Set<string>();
  private reshufflesUsed = new Set<string>(); // playerIds who used their reshuffle this round
  private playOrder: string[] = [];
  private playIndex = 0;
  private active: ActiveClue | null = null;
  private guessFeed: PublicGuess[] = [];
  private roundResults: ScoreRow[] | null = null;
  private gameResults: ScoreRow[] | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(code: string, private readonly deps: RoomDeps) {
    this.code = code;
  }

  // ── membership ──────────────────────────────────────────────────────────
  addPlayer(displayName: string, role: PlayerRole, avatar = '😎'): Player {
    const id = nanoid();
    const isHost = this.players.size === 0 && role === 'player';
    if (isHost) this.hostId = id;
    const player: PlayerState = {
      id,
      displayName,
      avatar,
      isHost,
      role,
      connection: 'CONNECTED',
      ready: false,
      score: 0,
      joinedAt: Date.now(),
      guesserPointsRound: 0,
      authorPointsRound: 0,
      lastGuessAt: 0,
      guessedThisClue: new Set(),
    };
    this.players.set(id, player);
    this.touch();
    this.changed();
    return player;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  setConnection(id: string, connection: Player['connection']): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connection = connection;
    this.touch();
    this.changed();
  }

  removePlayer(id: string): void {
    const wasHost = this.hostId === id;
    this.players.delete(id);
    if (this.players.size === 0) {
      this.close();
      return;
    }
    if (wasHost) this.migrateHost();
    this.changed();
  }

  private migrateHost(): void {
    // Promote the longest-connected active player (design doc §4).
    const candidate = [...this.players.values()]
      .filter((p) => p.role === 'player' && p.connection === 'CONNECTED')
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!candidate) return;
    for (const p of this.players.values()) p.isHost = false;
    candidate.isHost = true;
    this.hostId = candidate.id;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  // ── commands ────────────────────────────────────────────────────────────
  configure(byPlayerId: string, payload: ConfigureRoomPayload): void {
    this.assertHost(byPlayerId);
    if (this.phase !== 'LOBBY') throw new Error('Can only configure in the lobby.');
    if (payload.rounds !== undefined) this.config.rounds = clamp(payload.rounds, 1, 10);
    if (payload.clueCreationSeconds !== undefined)
      this.config.clueCreationSeconds = clamp(payload.clueCreationSeconds, 20, 180);
    if (payload.guessingSeconds !== undefined)
      this.config.guessingSeconds = clamp(payload.guessingSeconds, 15, 120);
    if (payload.packSlug !== undefined) this.config.packSlug = payload.packSlug;
    this.changed();
  }

  setReady(playerId: string, ready: boolean): void {
    const p = this.players.get(playerId);
    if (!p) throw new Error('Unknown player.');
    if (this.phase !== 'LOBBY') return; // ready only matters pre-game
    p.ready = ready;
    this.touch();
    this.changed();
  }

  start(byPlayerId: string): void {
    this.assertHost(byPlayerId);
    if (this.phase !== 'LOBBY' && this.phase !== 'GAME_RESULTS')
      throw new Error('Game already in progress.');
    const playerCount = [...this.players.values()].filter((p) => p.role === 'player').length;
    if (playerCount < MIN_PLAYERS) throw new Error(`Need at least ${MIN_PLAYERS} players.`);

    // reset for a fresh game / rematch
    for (const p of this.players.values()) {
      p.score = 0;
      p.guesserPointsRound = 0;
      p.authorPointsRound = 0;
      p.ready = false;
    }
    this.usedPromptKeys.clear();
    this.roundNumber = 0;
    this.gameResults = null;
    this.beginRound();
  }

  /** Swap a player's prompt for a different one in the same category (once/round). */
  reshufflePrompt(playerId: string): void {
    if (this.phase !== 'CLUE_CREATION') throw new Error('Not the clue-building phase.');
    if (!this.assignments.has(playerId)) throw new Error('You have no prompt this round.');
    if (this.clues.has(playerId)) throw new Error('You already submitted your clue.');
    if (this.reshufflesUsed.has(playerId)) throw new Error('You already reshuffled this round.');
    if (!this.category) throw new Error('No category this round.');

    const replacement = this.deps.content.drawOne(
      this.category.slug,
      this.usedPromptKeys, // excludes current assignments + everything used this game
      this.deps.rng,
    );
    if (!replacement) throw new Error('No more prompts to shuffle to.');

    this.assignments.set(playerId, replacement);
    this.usedPromptKeys.add(promptKey(replacement));
    this.reshufflesUsed.add(playerId);
    this.touch();
    this.changed();
  }

  submitClue(playerId: string, emojis: string[]): void {
    if (this.phase !== 'CLUE_CREATION') throw new Error('Not accepting clues right now.');
    const prompt = this.assignments.get(playerId);
    if (!prompt) throw new Error('You have no prompt this round.');
    const result = validateClue(emojis, {
      promptHasNumber: promptHasNumber(prompt.answer),
      forbiddenTokens: [prompt.answer, ...prompt.accepted],
    });
    if (!result.ok) throw new Error(result.errors.join(' '));
    this.clues.set(playerId, emojis);
    this.touch();
    this.changed();
    // Early-finish: everyone who has a prompt has submitted.
    if ([...this.assignments.keys()].every((id) => this.clues.has(id))) {
      this.startReveals();
    }
  }

  submitGuess(playerId: string, text: string): GuessResult {
    const reject = (reason: string): GuessResult => ({
      accepted: false,
      isCorrect: false,
      duplicate: false,
      solveRank: null,
      reason,
    });
    if (this.phase !== 'GUESSING' || !this.active) return reject('No clue is being guessed.');
    const player = this.players.get(playerId);
    if (!player) return reject('Unknown player.');
    if (player.role === 'spectator') return reject('Spectators cannot guess.');
    if (playerId === this.active.authorId) return reject('You authored this clue.');
    if (this.active.solvers.has(playerId)) return reject('You already solved this clue.');

    const now = Date.now();
    if (now - player.lastGuessAt < GUESS_MIN_INTERVAL_MS) return reject('Slow down a little.');
    player.lastGuessAt = now;

    const norm = text.trim().toLowerCase();
    if (!norm) return reject('Empty guess.');
    if (player.guessedThisClue.has(norm)) {
      return { accepted: true, isCorrect: false, duplicate: true, solveRank: null };
    }
    player.guessedThisClue.add(norm);

    const prompt = this.assignments.get(this.active.authorId)!;
    const correct = isCorrectGuess(text, {
      accepted: prompt.accepted,
      blocklist: prompt.blocklist,
    });

    let solveRank: number | null = null;
    let points: number | null = null;
    if (correct) {
      solveRank = ++this.active.solveCounter;
      const elapsedMs = now - this.active.revealAt;
      points = guesserPoints(elapsedMs, this.config.guessingSeconds * 1000, this.deps.scoring);
      this.active.solvers.set(playerId, { rank: solveRank, ms: elapsedMs, points });
      player.guesserPointsRound += points;
      player.score += points;
    }

    // Broadcast the guess. Correct guesses are blanked so the answer doesn't
    // leak to players who are still guessing (anti-cheat §7).
    const guess: PublicGuess = {
      id: nanoid(),
      guesserId: playerId,
      guesserName: player.displayName,
      text: correct ? '' : text,
      isCorrect: correct,
      solveRank,
      points,
      at: now,
    };
    this.guessFeed.push(guess);
    if (this.guessFeed.length > 100) this.guessFeed.shift();
    this.touch();
    this.deps.hooks.onGuess(this, guess);

    if (correct) {
      this.changed(); // refresh solved counts / scoreboard
      if (this.active.solvers.size >= this.eligibleGuessers()) this.endGuessing();
    }
    return {
      accepted: true,
      isCorrect: correct,
      duplicate: false,
      solveRank,
    };
  }

  hostSkip(byPlayerId: string): void {
    this.assertHost(byPlayerId);
    if (this.phase === 'GUESSING') this.endGuessing();
    else if (this.phase === 'CLUE_CREATION') this.startReveals();
  }

  hostNext(byPlayerId: string): void {
    this.assertHost(byPlayerId);
    if (this.phase === 'ROUND_RESULTS') this.nextRoundOrEnd();
  }

  // ── state machine ─────────────────────────────────────────────────────────
  private beginRound(): void {
    this.roundNumber += 1;
    this.clues.clear();
    this.assignments.clear();
    this.reshufflesUsed.clear();
    this.roundResults = null;
    this.guessFeed = [];

    const playerIds = [...this.players.values()]
      .filter((p) => p.role === 'player')
      .map((p) => p.id);
    const dealt = this.deps.content.dealRound(
      this.deps.content.categorySlugsForPack(this.config.packSlug),
      playerIds.length,
      this.usedPromptKeys,
      this.deps.rng,
    );
    if (!dealt) {
      this.deps.hooks.onStateChange(this);
      throw new Error('No prompt content available.');
    }
    this.category = dealt.category;
    playerIds.forEach((id, i) => {
      const prompt = dealt.assignments[i % dealt.assignments.length]!;
      this.assignments.set(id, prompt);
      this.usedPromptKeys.add(promptKey(prompt));
    });

    this.transition('ROUND_INTRO', ROUND_INTRO_MS, () => this.startPromptAssignment());
  }

  private startPromptAssignment(): void {
    // Visible "secret prompt + 3-2-1-GO" beat before building (design screen 4).
    this.transition('PROMPT_ASSIGNMENT', PROMPT_ASSIGNMENT_MS, () => this.startClueCreation());
  }

  private startClueCreation(): void {
    this.transition('CLUE_CREATION', this.config.clueCreationSeconds * 1000, () =>
      this.startReveals(),
    );
  }

  private startReveals(): void {
    // Only players who submitted a (non-empty) clue get played.
    this.playOrder = [...this.assignments.keys()].filter((id) => (this.clues.get(id)?.length ?? 0) > 0);
    this.playIndex = 0;
    this.playNext();
  }

  private playNext(): void {
    if (this.playIndex >= this.playOrder.length) {
      this.endRound();
      return;
    }
    const authorId = this.playOrder[this.playIndex]!;
    this.active = { authorId, revealAt: 0, solveCounter: 0, solvers: new Map(), authorPoints: null };
    for (const p of this.players.values()) p.guessedThisClue = new Set();
    this.transition('CLUE_REVEAL', CLUE_REVEAL_MS, () => this.startGuessing());
  }

  private startGuessing(): void {
    if (this.active) this.active.revealAt = Date.now();
    this.transition('GUESSING', this.config.guessingSeconds * 1000, () => this.endGuessing());
  }

  private endGuessing(): void {
    if (!this.active) return;
    const author = this.players.get(this.active.authorId);
    const pts = authorPoints(this.active.solvers.size, this.deps.scoring);
    this.active.authorPoints = pts; // record on the clue for the Reveal screen
    if (author) {
      author.authorPointsRound += pts;
      author.score += pts;
    }
    this.transition('CLUE_SCORING', CLUE_SCORING_MS, () => {
      this.playIndex += 1;
      this.active = null;
      this.playNext();
    });
  }

  private endRound(): void {
    this.roundResults = this.buildScoreRows();
    this.transition('ROUND_RESULTS', ROUND_RESULTS_MS, () => this.nextRoundOrEnd());
  }

  private nextRoundOrEnd(): void {
    // reset per-round tallies
    for (const p of this.players.values()) {
      p.guesserPointsRound = 0;
      p.authorPointsRound = 0;
    }
    if (this.roundNumber >= this.config.rounds) this.endGame();
    else this.beginRound();
  }

  private endGame(): void {
    this.gameResults = this.buildScoreRows();
    this.category = null;
    this.active = null;
    this.transition('GAME_RESULTS', null, null);
    // RoomManager persists the completed game from onStateChange.
  }

  private close(): void {
    this.clearTimer();
    this.phase = 'ROOM_CLOSED';
    this.deps.hooks.onClosed(this);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  private transition(
    phase: GamePhase,
    durationMs: number | null,
    onExpire: (() => void) | null,
  ): void {
    this.clearTimer();
    this.phase = phase;
    this.version += 1;
    this.deadlineTs = durationMs ? Date.now() + durationMs : null;
    if (durationMs && onExpire) {
      this.timer = setTimeout(() => {
        this.timer = null;
        try {
          onExpire();
        } catch (err) {
          console.error(`[room ${this.code}] transition error:`, err);
        }
      }, durationMs);
    }
    this.deps.hooks.onStateChange(this);
  }

  private changed(): void {
    this.version += 1;
    this.deps.hooks.onStateChange(this);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private eligibleGuessers(): number {
    let n = 0;
    for (const p of this.players.values()) {
      if (p.role === 'player' && p.id !== this.active?.authorId && p.connection === 'CONNECTED') n++;
    }
    return n;
  }

  private buildScoreRows(): ScoreRow[] {
    const rows = [...this.players.values()]
      .filter((p) => p.role === 'player')
      .map((p) => ({
        playerId: p.id,
        displayName: p.displayName,
        avatar: p.avatar,
        totalScore: p.score,
        guesserPoints: p.guesserPointsRound,
        authorPoints: p.authorPointsRound,
        rank: 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  /** Build the per-clue solve list (finish order) for the Reveal screen. */
  private buildSolves(active: ActiveClue): ClueSolve[] {
    return [...active.solvers.entries()]
      .map(([playerId, rec]) => {
        const p = this.players.get(playerId);
        return {
          playerId,
          displayName: p?.displayName ?? '???',
          avatar: p?.avatar ?? '❓',
          rank: rec.rank,
          ms: rec.ms,
          points: rec.points,
        };
      })
      .sort((a, b) => a.rank - b.rank);
  }

  private assertHost(playerId: string): void {
    if (playerId !== this.hostId) throw new Error('Only the host can do that.');
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }

  // ── snapshot for the serializer ────────────────────────────────────────────
  getSnapshot(): RoomSnapshot {
    const assignments = new Map<string, string>();
    for (const [pid, prompt] of this.assignments) assignments.set(pid, prompt.answer);

    let active: RoomSnapshot['active'] = null;
    if (this.active) {
      const author = this.players.get(this.active.authorId);
      active = {
        authorId: this.active.authorId,
        authorName: author?.displayName ?? '???',
        authorAvatar: author?.avatar ?? '❓',
        emojis: this.clues.get(this.active.authorId) ?? [],
        answer: this.assignments.get(this.active.authorId)?.answer ?? '',
        solvedCount: this.active.solvers.size,
        eligibleCount: this.eligibleGuessers(),
        solves: this.buildSolves(this.active),
        authorPoints: this.active.authorPoints,
      };
    }

    return {
      code: this.code,
      phase: this.phase,
      version: this.version,
      deadlineTs: this.deadlineTs,
      config: this.config,
      hostId: this.hostId,
      roundNumber: this.roundNumber,
      category: this.category,
      packs: this.deps.content.packs(),
      players: [...this.players.values()].map(toPublicPlayer),
      assignments,
      submittedAuthorIds: new Set(this.clues.keys()),
      reshuffledIds: new Set(this.reshufflesUsed),
      active,
      guessFeed: this.guessFeed,
      roundResults: this.roundResults,
      gameResults: this.gameResults,
    };
  }
}

function toPublicPlayer(p: PlayerState): Player {
  return {
    id: p.id,
    displayName: p.displayName,
    avatar: p.avatar,
    isHost: p.isHost,
    role: p.role,
    connection: p.connection,
    ready: p.ready,
    score: p.score,
    joinedAt: p.joinedAt,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}
