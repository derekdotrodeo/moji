/**
 * Config-driven scoring. Pure and config-driven so the state machine never
 * hard-codes constants and so we can tune/A-B-test without touching game flow.
 *
 * Reconciled with the "Retro Internet Party" design handoff:
 *   - Guesser points are TIME-WEIGHTED (faster guess = more points), per the
 *     design ("+900 / 4.8s"), replacing the earlier rank-based model.
 *   - Author points are PROPORTIONAL to how many players solve the clue, per
 *     the design ("+650 for a clue everyone solved"). This intentionally
 *     overrides the original brief's "Goldilocks" curve (which zeroed out
 *     too-obvious clues) — product decision: reward clues that land.
 */

export interface ScoringConfig {
  /** points for an instant correct guess (elapsed ≈ 0) */
  guesserMax: number;
  /** floor points for a correct guess right at the buzzer */
  guesserMin: number;
  /** author points earned per player who solves the clue */
  authorPerSolve: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  guesserMax: 1000,
  guesserMin: 150,
  authorPerSolve: 130, // 5 solvers -> 650, matching the design's example
};

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
 * Author points: proportional to the number of players who solved the clue.
 * More solvers -> more points (rewards a clue that lands with the group).
 */
export function authorPoints(solvedCount: number, cfg: ScoringConfig = DEFAULT_SCORING): number {
  return Math.max(0, Math.round(cfg.authorPerSolve * solvedCount));
}
