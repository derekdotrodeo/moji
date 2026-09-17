/**
 * The solo bot's decision-making. Pure functions over public information,
 * separated from the driver for the same reason scoring and hints are separate
 * from the state machine: the interesting behaviour is testable without a room,
 * a timer, or a socket.
 *
 * WHAT THE BOT KNOWS. Everything here runs on the emoji of the clue in front of
 * it and the pack that clue came from — the two public fields of
 * `ActiveClueView`. The bot is driven by `serializeRoomFor(snap, botId)`, the
 * same role-filtered payload a browser receives, so it *cannot* read the answer
 * to a human's clue: the serializer does not put it in the payload. It has to
 * actually guess, and it is regularly wrong.
 *
 * HOW IT GUESSES. Each answer in the bot's clue library has 1+ hand-written
 * emoji clues (see content/database/bot-clues.ts). Treat each answer's combined
 * emoji as a document and the human's clue as a query, weight each emoji by how
 * rare it is across the library (an emoji everyone reaches for, 😂, says much
 * less than 🦣), and rank by cosine similarity. Classic TF-IDF retrieval over
 * a very small, very strange corpus.
 *
 * WHY CONFIDENCE DRIVES *TIMING*, NOT JUST CHOICE. Author points are
 * `100 + 150 × (how long the solve took / window)` per solver, so a clue that
 * gets cracked instantly pays its author almost nothing and one that takes the
 * full window pays nearly double. Mapping the bot's confidence onto its solve
 * time therefore makes the bot enforce the curve scoring.ts is built around: a
 * literal clue (🦁👑) scores a high cosine, gets guessed early, and earns you
 * little; an oblique one has the bot circling, throwing wrong guesses into the
 * feed, and landing late — which pays. A bot that simply knew the answer and
 * waited a random interval would score identically and mean nothing.
 */

import type { BotClueEntry } from '../content/database/bot-clues.js';

export interface BotTuning {
  /** Most guesses the bot will throw at one clue. */
  maxGuesses: number;
  /** Cosine at or above which the bot is treated as fully confident. */
  confidentAt: number;
  /** Earliest first guess, as a fraction of the guess window. */
  fastestFraction: number;
  /** Latest first guess, as a fraction of the guess window. */
  slowestFraction: number;
  /** Minimum gap between the bot's guesses (the room rate-limits at 500ms). */
  guessSpacingMs: number;
  /** Fraction of the window past which the bot stops guessing entirely. */
  lastCallFraction: number;
  /** Jitter applied to every scheduled time, as a fraction of the window. */
  jitterFraction: number;
  /** Share of the clue-creation window the bot spends "thinking". */
  clueDelayFraction: [min: number, max: number];
}

export const DEFAULT_BOT_TUNING: BotTuning = {
  maxGuesses: 3,
  confidentAt: 0.45,
  fastestFraction: 0.18,
  slowestFraction: 0.82,
  guessSpacingMs: 1_600,
  lastCallFraction: 0.95,
  jitterFraction: 0.06,
  clueDelayFraction: [0.12, 0.35],
};

// ── retrieval index ─────────────────────────────────────────────────────────

export interface EmojiIndex {
  /** answer -> the emoji its clues use, deduped */
  vocabulary: Map<string, Set<string>>;
  /** emoji -> inverse document frequency across the library */
  idf: Map<string, number>;
  /** answer -> vector length, precomputed for the cosine denominator */
  norm: Map<string, number>;
}

/**
 * Build the retrieval index once at startup. `df` counts *answers* using an
 * emoji, not clues, so authoring a second variant for a title never makes its
 * own emoji look commonplace.
 */
export function buildEmojiIndex(entries: BotClueEntry[]): EmojiIndex {
  const vocabulary = new Map<string, Set<string>>();
  const df = new Map<string, number>();

  for (const entry of entries) {
    const emoji = new Set(entry.clues.flat());
    vocabulary.set(entry.answer, emoji);
    for (const e of emoji) df.set(e, (df.get(e) ?? 0) + 1);
  }

  const total = entries.length || 1;
  const idf = new Map<string, number>();
  // Smoothed, and floored at a small positive value: an emoji used by every
  // answer is uninformative but not actively misleading.
  for (const [e, count] of df) idf.set(e, Math.max(0.05, Math.log((total + 1) / (count + 0.5))));

  const norm = new Map<string, number>();
  for (const [answer, emoji] of vocabulary) {
    let sum = 0;
    for (const e of emoji) sum += (idf.get(e) ?? 0) ** 2;
    norm.set(answer, Math.sqrt(sum));
  }

  return { vocabulary, idf, norm };
}

export interface Candidate {
  answer: string;
  /** Cosine similarity in [0,1]; 0 means no shared emoji at all. */
  score: number;
}

/**
 * Rank the candidate answers against a clue. `candidates` is the pack the clue
 * came from — public information, and the reason the pack label is on screen at
 * all: it narrows the search for the bot exactly as it does for a human.
 *
 * An emoji the bot has never seen in any clue contributes nothing rather than
 * breaking the cosine, so a human using an emoji outside the library simply
 * gets no help from it.
 */
export function rankCandidates(
  emojis: string[],
  candidates: Iterable<string>,
  index: EmojiIndex,
): Candidate[] {
  const query = new Set(emojis);
  let queryNorm = 0;
  for (const e of query) queryNorm += (index.idf.get(e) ?? 0) ** 2;
  queryNorm = Math.sqrt(queryNorm);

  const ranked: Candidate[] = [];
  for (const answer of candidates) {
    const vocab = index.vocabulary.get(answer);
    if (!vocab) continue;
    let dot = 0;
    for (const e of query) if (vocab.has(e)) dot += (index.idf.get(e) ?? 0) ** 2;
    const denom = queryNorm * (index.norm.get(answer) ?? 0);
    ranked.push({ answer, score: denom > 0 ? dot / denom : 0 });
  }

  // Alphabetical tie-break keeps a zero-overlap ranking deterministic for tests
  // rather than dependent on Map insertion order.
  return ranked.sort((a, b) => b.score - a.score || a.answer.localeCompare(b.answer));
}

// ── timing ──────────────────────────────────────────────────────────────────

export interface PlannedGuess {
  text: string;
  /** ms after the guess window opened */
  atMs: number;
}

function jitter(ms: number, windowMs: number, cfg: BotTuning, rng: () => number): number {
  const spread = windowMs * cfg.jitterFraction;
  return ms + (rng() * 2 - 1) * spread;
}

/**
 * When the bot would land its first guess, given how sure it is. Confident →
 * early (and cheap for the author); stumped → late (and lucrative).
 */
export function firstGuessFraction(confidence: number, cfg: BotTuning = DEFAULT_BOT_TUNING): number {
  const sureness = Math.max(0, Math.min(1, confidence / cfg.confidentAt));
  return cfg.slowestFraction - (cfg.slowestFraction - cfg.fastestFraction) * sureness;
}

/**
 * The bot's whole plan for one clue: guess its best candidates in rank order,
 * starting at a time its confidence chose. It does not know which of them is
 * right — the server tells it, by accepting one. Wrong guesses land in the
 * public feed, which is most of what makes a solo room feel inhabited.
 *
 * Nothing is scheduled past `lastCallFraction` of the window: a guess that
 * arrives after the buzzer is rejected anyway.
 */
export function planGuesses(
  candidates: Candidate[],
  windowMs: number,
  cfg: BotTuning = DEFAULT_BOT_TUNING,
  rng: () => number = Math.random,
): PlannedGuess[] {
  if (candidates.length === 0 || windowMs <= 0) return [];

  const scored = candidates.filter((c) => c.score > 0);
  // Genuinely stumped: nothing in the clue overlaps anything the bot knows.
  // It still guesses — it just guesses badly, and late.
  const shortlist = (scored.length > 0 ? scored : candidates.slice(0, 2)).slice(0, cfg.maxGuesses);
  const confidence = scored.length > 0 ? shortlist[0]!.score : 0;

  const deadline = windowMs * cfg.lastCallFraction;
  const plan: PlannedGuess[] = [];
  let at = jitter(windowMs * firstGuessFraction(confidence, cfg), windowMs, cfg, rng);

  for (const candidate of shortlist) {
    const when = Math.max(0, Math.round(at));
    if (when > deadline) break;
    plan.push({ text: candidate.answer, atMs: when });
    at = when + cfg.guessSpacingMs * (0.75 + rng() * 0.75);
  }
  return plan;
}

/** How long the bot takes to "write" its clue, inside the creation window. */
export function clueSubmitDelayMs(
  windowMs: number,
  cfg: BotTuning = DEFAULT_BOT_TUNING,
  rng: () => number = Math.random,
): number {
  const [min, max] = cfg.clueDelayFraction;
  return Math.round(windowMs * (min + rng() * (max - min)));
}

/**
 * Which clue variant to play. `avoid` carries the clues already used this game,
 * so a rematch on the same prompt doesn't replay the same emoji.
 */
export function pickClue(
  clues: string[][],
  avoid: ReadonlySet<string> = new Set(),
  rng: () => number = Math.random,
): string[] | null {
  if (clues.length === 0) return null;
  const fresh = clues.filter((c) => !avoid.has(c.join('')));
  const pool = fresh.length > 0 ? fresh : clues;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}
