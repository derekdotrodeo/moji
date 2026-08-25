/**
 * Config-driven scoring. Pure and config-driven so the state machine never
 * hard-codes constants and so we can tune/A-B-test without touching game flow.
 *
 * Reconciled with the "Retro Internet Party" design handoff:
 *   - Guesser points are TIME-WEIGHTED (faster guess = more points), per the
 *     design ("+900 / 4.8s"), replacing the earlier rank-based model.
 *   - Author points are TIME-WEIGHTED PER SOLVER: every solve pays, and a solve
 *     that took a while pays more than an instant one. See `authorPoints`.
 */

export interface ScoringConfig {
  /** points for an instant correct guess (elapsed ≈ 0) */
  guesserMax: number;
  /** floor points for a correct guess right at the buzzer */
  guesserMin: number;
  /** author points for a solve that lands instantly (the gimme clue) */
  authorSolveBase: number;
  /** extra author points as a solve drifts toward the buzzer */
  authorSolveSpan: number;
  /** author points per player who bumps the clue */
  bumpPoints: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  guesserMax: 1000,
  guesserMin: 150,
  authorSolveBase: 100,
  authorSolveSpan: 150,
  bumpPoints: 50,
};

/** Fraction of the guess window a solve consumed, clamped to [0,1]. */
function elapsedFraction(elapsedMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0;
  return Math.max(0, Math.min(1, elapsedMs / windowMs));
}

/**
 * Time-weighted guesser points: linear decay from `guesserMax` at reveal to
 * `guesserMin` at the end of the guess window. A correct guess always beats a
 * wrong/none (>= guesserMin), and faster always scores higher.
 */
export function guesserPoints(
  elapsedMs: number,
  windowMs: number,
  cfg: ScoringConfig = DEFAULT_SCORING,
): number {
  const frac = windowMs > 0 ? Math.max(0, Math.min(1, 1 - elapsedMs / windowMs)) : 1;
  return Math.round(cfg.guesserMin + (cfg.guesserMax - cfg.guesserMin) * frac);
}

/**
 * What one solve is worth to the clue's author: `base` for an instant solve,
 * rising to `base + span` for one that lands at the buzzer.
 *
 * This is the incentive that makes the game about cluing craft. A flat
 * per-solve rate makes the most literal clue you can build (🦁👑) strictly
 * optimal, which is the exact "type the answer as a picture" failure that
 * `docs/content-guidelines.md` rejects whole content categories for. Weighting
 * by *how long the solve took* puts a second dial on the author: they want
 * everyone to get there, but not instantly.
 *
 * Deliberately monotonic in time as well as in solver count, so a solve is
 * never worth less than nothing to you. That is what the old "Goldilocks"
 * curve got wrong — it could zero out a clue after players did the work, which
 * felt like a punishment. Here the floor is `base` and every solve adds to it.
 */
export function authorPointsForSolve(
  elapsedMs: number,
  windowMs: number,
  cfg: ScoringConfig = DEFAULT_SCORING,
): number {
  return Math.round(
    cfg.authorSolveBase + cfg.authorSolveSpan * elapsedFraction(elapsedMs, windowMs),
  );
}

/**
 * Author points for a clue: the sum over everyone who solved it. More solvers
 * is always better; solvers who had to work for it are better still.
 */
export function authorPoints(
  solves: Iterable<{ ms: number }>,
  windowMs: number,
  cfg: ScoringConfig = DEFAULT_SCORING,
): number {
  let total = 0;
  for (const solve of solves) total += authorPointsForSolve(solve.ms, windowMs, cfg);
  return total;
}

/** Author bonus for players who bumped the clue on the reveal. */
export function bumpAward(bumpCount: number, cfg: ScoringConfig = DEFAULT_SCORING): number {
  return Math.max(0, Math.round(cfg.bumpPoints * bumpCount));
}
