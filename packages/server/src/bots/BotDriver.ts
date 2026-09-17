/**
 * Drives one bot player.
 *
 * The bot is a HEADLESS CLIENT, and that is the whole design. It is handed the
 * output of `serializeRoomFor(snapshot, botId)` — byte for byte what a browser
 * on the other side of the room receives — and it acts by calling the same
 * guarded `Room` commands a socket handler calls. It has no privileged read of
 * room state and no privileged write to it. Consequences worth stating:
 *
 *   - It cannot see the answer to a human's clue, because the serializer does
 *     not put it in its payload. It guesses (see brain.ts) and it misses.
 *   - It is rate-limited, validated and rejected exactly like a human. Every
 *     command is wrapped in a try/catch because a legitimate race (the clue
 *     resolved while a guess was in flight) is a *rejection*, not a bug.
 *   - Removing the serializer's role filtering would make the bot cheat, which
 *     means the bot is a live test of the boundary the game is built on.
 *
 * Timers are the driver's only state beyond "what have I already planned for
 * this clue". Every scheduled action captures the key of the thing it was
 * planned for and re-checks it on fire, because phases end early all the time:
 * everybody solves, the host skips, a player leaves.
 */
import type { RoomView } from '@moji/shared';
import {
  DEFAULT_BOT_TUNING,
  buildEmojiIndex,
  clueSubmitDelayMs,
  pickClue,
  planGuesses,
  rankCandidates,
  type BotTuning,
  type EmojiIndex,
} from './brain.js';
import { BOT_CLUES, botCluesFor } from '../content/database/bot-clues.js';
import { cluedAnswersByPack } from '../content/solo.js';

/** The commands a bot can issue. Wired to `Room` methods by the RoomManager. */
export interface BotCommands {
  submitClue(emojis: string[]): void;
  submitGuess(text: string): void;
  bump(): void;
  chat(text: string): void;
}

export interface BotDriverDeps {
  commands: BotCommands;
  /** Prebuilt retrieval index; defaults to one built from the whole library. */
  index?: EmojiIndex;
  /** Answers the bot will consider for a given pack slug. */
  candidatesForPack?: (slug: string) => Iterable<string>;
  tuning?: BotTuning;
  rng?: () => number;
  /** Test seam: schedule work. Defaults to setTimeout. */
  schedule?: (fn: () => void, delayMs: number) => NodeJS.Timeout;
  clear?: (handle: NodeJS.Timeout) => void;
}

/** Things to say in the solvers' side channel. Never about the answer itself. */
const SOLVED_LINES = ['nice one 👏', 'ohhh, I see it now', 'took me a second 😅', 'good clue'];
const AUTHOR_LINES = ['knew you had it 😎', 'nice, that was quick', 'too easy for you'];

let sharedIndex: EmojiIndex | null = null;
let sharedCandidates: Map<string, Set<string>> | null = null;

export class BotDriver {
  private readonly index: EmojiIndex;
  private readonly tuning: BotTuning;
  private readonly rng: () => number;
  private readonly schedule: (fn: () => void, delayMs: number) => NodeJS.Timeout;
  private readonly clear: (handle: NodeJS.Timeout) => void;
  private readonly candidatesForPack: (slug: string) => Iterable<string>;

  private timers = new Set<NodeJS.Timeout>();
  /** Round we have already scheduled a clue submission for. */
  private clueScheduledForRound: number | null = null;
  /** `${round}:${authorId}` of the clue we have already planned guesses for. */
  private guessesPlannedFor: string | null = null;
  private chattedFor: string | null = null;
  private bumpedFor: string | null = null;
  /** Clue variants already played this game, so a rematch looks different. */
  private usedClues = new Set<string>();
  private disposed = false;

  constructor(private readonly deps: BotDriverDeps) {
    if (!sharedIndex) sharedIndex = buildEmojiIndex(BOT_CLUES);
    if (!sharedCandidates) sharedCandidates = cluedAnswersByPack();
    this.index = deps.index ?? sharedIndex;
    this.tuning = deps.tuning ?? DEFAULT_BOT_TUNING;
    this.rng = deps.rng ?? Math.random;
    this.schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.clear = deps.clear ?? ((h) => clearTimeout(h));
    this.candidatesForPack =
      deps.candidatesForPack ?? ((slug) => sharedCandidates?.get(slug) ?? []);
  }

  /** Called with the bot's own role-filtered view every time the room changes. */
  onView(view: RoomView): void {
    if (this.disposed) return;
    switch (view.phase) {
      case 'CLUE_CREATION':
        this.considerClue(view);
        return;
      case 'GUESSING':
        this.considerGuesses(view);
        this.considerSocial(view);
        return;
      case 'CLUE_SCORING':
        this.considerSocial(view);
        return;
      case 'LOBBY':
      case 'ROUND_INTRO':
        // A fresh round is coming; forget what we planned for the last one.
        this.clueScheduledForRound = null;
        this.guessesPlannedFor = null;
        return;
      default:
        return;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) this.clear(t);
    this.timers.clear();
  }

  // ── authoring ─────────────────────────────────────────────────────────────

  private considerClue(view: RoomView): void {
    if (view.youSubmitted || !view.yourPrompt) return;
    if (this.clueScheduledForRound === view.roundNumber) return;

    const clues = botCluesFor(view.yourPrompt);
    const clue = clues ? pickClue(clues, this.usedClues, this.rng) : null;
    if (!clue) {
      // Solo rounds only deal prompts the bot has clues for, so this is the
      // "somebody put a bot in a party game" path: sit the round out rather
      // than submit something embarrassing. The round still plays the humans.
      this.clueScheduledForRound = view.roundNumber;
      return;
    }

    this.clueScheduledForRound = view.roundNumber;
    const windowMs = view.config.clueCreationSeconds * 1000;
    const remaining = this.remainingMs(view, windowMs);
    // Never plan past the buzzer: a submission the window has closed on is
    // rejected, and the bot's clue silently drops out of the playback order.
    const delay = Math.min(clueSubmitDelayMs(windowMs, this.tuning, this.rng), remaining * 0.8);
    const round = view.roundNumber;

    this.after(delay, () => {
      if (this.clueScheduledForRound !== round) return;
      this.usedClues.add(clue.join(''));
      this.run(() => this.deps.commands.submitClue(clue));
    });
  }

  // ── guessing ──────────────────────────────────────────────────────────────

  private considerGuesses(view: RoomView): void {
    const clue = view.activeClue;
    if (!clue || clue.youAreAuthor || clue.yourSolve) return;

    const key = `${view.roundNumber}:${clue.authorId}`;
    if (this.guessesPlannedFor === key) return;
    this.guessesPlannedFor = key;

    // The pack is the bot's search space, and it is public for exactly this
    // reason. Per-clue (`activeClue.category`), never the round's — under
    // 'mixed' pack mode there is no round pack at all.
    const pack = clue.category?.slug;
    if (!pack) return;

    const windowMs = view.config.guessingSeconds * 1000;
    const ranked = rankCandidates(clue.emojis, this.candidatesForPack(pack), this.index);
    const plan = planGuesses(ranked, windowMs, this.tuning, this.rng);
    // How far into the window we already are — the bot may have been handed
    // this view a beat late, or reconnected into a clue in progress.
    const elapsed = windowMs - this.remainingMs(view, windowMs);

    for (const guess of plan) {
      this.after(Math.max(0, guess.atMs - elapsed), () => {
        if (this.guessesPlannedFor !== key) return;
        this.run(() => this.deps.commands.submitGuess(guess.text));
      });
    }
  }

  // ── bumps and chat ────────────────────────────────────────────────────────

  /**
   * Applaud, and say something to the others who know the answer. Both are
   * gated by the server on being entitled to the answer, so the bot can only do
   * either once it has solved the clue or the clue has resolved — the same rule
   * that governs a human. In a solo room this is also the only way the human
   * ever sees the solvers' channel work.
   */
  private considerSocial(view: RoomView): void {
    const clue = view.activeClue;
    if (!clue) return;
    const key = `${view.roundNumber}:${clue.authorId}`;

    if (clue.youCanBump && this.bumpedFor !== key) {
      this.bumpedFor = key;
      // Bump the clues that made it work: a solve it had to grind for, or one
      // it never cracked and has just been shown the answer to.
      const earned = !clue.yourSolve || clue.yourSolve.ms > view.config.guessingSeconds * 400;
      if (earned || this.rng() < 0.35) {
        this.after(600 + this.rng() * 1200, () => this.run(() => this.deps.commands.bump()));
      }
    }

    const canTalk = !!clue.yourSolve || (clue.youAreAuthor && clue.solvedCount > 0);
    if (canTalk && this.chattedFor !== key && this.rng() < 0.7) {
      this.chattedFor = key;
      const lines = clue.youAreAuthor ? AUTHOR_LINES : SOLVED_LINES;
      const line = lines[Math.floor(this.rng() * lines.length)]!;
      this.after(900 + this.rng() * 1600, () => this.run(() => this.deps.commands.chat(line)));
    }
  }

  // ── plumbing ──────────────────────────────────────────────────────────────

  /** Time left in the current phase, falling back to the full window. */
  private remainingMs(view: RoomView, windowMs: number): number {
    if (view.deadlineTs === null) return windowMs;
    return Math.max(0, Math.min(windowMs, view.deadlineTs - Date.now()));
  }

  private after(delayMs: number, fn: () => void): void {
    const handle = this.schedule(() => {
      this.timers.delete(handle);
      if (!this.disposed) fn();
    }, Math.max(0, Math.round(delayMs)));
    this.timers.add(handle);
  }

  /**
   * Issue a command. A rejection is normal — the clue may have resolved while
   * this was queued — and must never take the server down with it.
   */
  private run(fn: () => void): void {
    try {
      fn();
    } catch {
      /* the server said no; that is its job */
    }
  }
}
