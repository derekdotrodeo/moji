/**
 * Progressive letter hints for the guessing phase (skribbl-style blanks).
 *
 * Pure and config-driven for the same reason scoring is: the state machine
 * decides *when* to tick, this module decides what a hint looks like and which
 * letter lands when — so both are testable without spinning up a room.
 *
 * ANTI-CHEAT: the plan is computed server-side and pushed ONE STEP AT A TIME.
 * A guesser's client only ever receives the mask as it stands right now, never
 * the answer and never the schedule — the same invariant the role-filtered
 * serializer enforces (see server/src/realtime/serialize.ts).
 */

/** Dead air before the first letter drops, so the clue gets a fair look first. */
export const HINT_START_DELAY_MS = 5_000;
/** Share of an answer's letters shown by the end of the guess window. */
export const HINT_REVEAL_FRACTION = 0.75;
/** Stand-in for a letter that has not been revealed yet. */
export const HINT_BLANK = '_';

export interface HintConfig {
  startDelayMs: number;
  revealFraction: number;
}

export const DEFAULT_HINT_CONFIG: HintConfig = {
  startDelayMs: HINT_START_DELAY_MS,
  revealFraction: HINT_REVEAL_FRACTION,
};

export interface HintPlan {
  /** Character indices to reveal, in reveal order. */
  order: number[];
  /** times[i] = ms after the guess window opens when order[i] is revealed. */
  times: number[];
}

/** Letters and digits are masked; spaces and punctuation are free structure. */
const MASKABLE = /[\p{L}\p{N}]/u;

/** Indices (into [...answer]) of the characters a hint hides. */
export function maskableIndices(answer: string): number[] {
  const chars = [...answer];
  const out: number[] = [];
  for (let i = 0; i < chars.length; i++) if (MASKABLE.test(chars[i]!)) out.push(i);
  return out;
}

/**
 * Which letters get revealed, and when. Positions are scattered rather than
 * left-to-right so the answer fills in the way it does in skribbl — the shape
 * arrives before the spelling.
 *
 * `revealFraction` is a ceiling that is always short of the whole answer:
 * flooring guarantees at least one letter stays hidden, so the mask can never
 * become the answer no matter how long the window runs.
 */
export function planHintReveal(
  answer: string,
  windowMs: number,
  rng: () => number = Math.random,
  cfg: HintConfig = DEFAULT_HINT_CONFIG,
): HintPlan {
  const slots = maskableIndices(answer);
  const usableMs = windowMs - cfg.startDelayMs;
  const count = Math.floor(slots.length * cfg.revealFraction);
  if (count <= 0 || usableMs <= 0) return { order: [], times: [] };

  const shuffled = [...slots];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const order = shuffled.slice(0, count);
  // First letter lands exactly on the delay, the last one a step before the
  // buzzer — a reveal at 0:00 would be worth nothing to anyone.
  const step = usableMs / count;
  const times = order.map((_, i) => Math.round(cfg.startDelayMs + i * step));
  return { order, times };
}

/** The answer with every unrevealed letter blanked out. */
export function renderHint(answer: string, revealed: Iterable<number>): string {
  const shown = new Set(revealed);
  return [...answer]
    .map((ch, i) => (MASKABLE.test(ch) && !shown.has(i) ? HINT_BLANK : ch))
    .join('');
}
