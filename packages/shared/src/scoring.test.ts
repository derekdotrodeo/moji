import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORING,
  authorPoints,
  authorPointsForSolve,
  bumpAward,
  guesserPoints,
} from './scoring.js';

const WINDOW = 30_000; // 30s guess window

describe('guesserPoints (time-weighted)', () => {
  it('awards the max for an instant correct guess', () => {
    expect(guesserPoints(0, WINDOW)).toBe(DEFAULT_SCORING.guesserMax);
  });

  it('awards the floor for a correct guess at the buzzer', () => {
    expect(guesserPoints(WINDOW, WINDOW)).toBe(DEFAULT_SCORING.guesserMin);
  });

  it('decays monotonically as the guess gets slower', () => {
    let prev = Infinity;
    for (let t = 0; t <= WINDOW; t += 3000) {
      const pts = guesserPoints(t, WINDOW);
      expect(pts).toBeLessThanOrEqual(prev);
      prev = pts;
    }
  });

  it('a fast guess always beats the floor', () => {
    expect(guesserPoints(4800, WINDOW)).toBeGreaterThan(DEFAULT_SCORING.guesserMin);
  });

  it('clamps to the floor past the window', () => {
    expect(guesserPoints(WINDOW * 2, WINDOW)).toBe(DEFAULT_SCORING.guesserMin);
  });
});

describe('authorPointsForSolve (time-weighted)', () => {
  it('pays the base for an instant solve — the gimme clue', () => {
    expect(authorPointsForSolve(0, WINDOW)).toBe(DEFAULT_SCORING.authorSolveBase);
  });

  it('pays base + span for a solve right at the buzzer', () => {
    expect(authorPointsForSolve(WINDOW, WINDOW)).toBe(
      DEFAULT_SCORING.authorSolveBase + DEFAULT_SCORING.authorSolveSpan,
    );
  });

  it('rises monotonically as the solve gets slower', () => {
    let prev = -Infinity;
    for (let t = 0; t <= WINDOW; t += 3000) {
      const pts = authorPointsForSolve(t, WINDOW);
      expect(pts).toBeGreaterThanOrEqual(prev);
      prev = pts;
    }
  });

  it('clamps past the window instead of paying unbounded points', () => {
    expect(authorPointsForSolve(WINDOW * 5, WINDOW)).toBe(authorPointsForSolve(WINDOW, WINDOW));
  });

  it('never pays less than the base, so a solve is never a penalty', () => {
    for (let t = 0; t <= WINDOW; t += 1000) {
      expect(authorPointsForSolve(t, WINDOW)).toBeGreaterThanOrEqual(
        DEFAULT_SCORING.authorSolveBase,
      );
    }
  });
});

describe('authorPoints (sum over solvers)', () => {
  it('is zero when nobody solves', () => {
    expect(authorPoints([], WINDOW)).toBe(0);
  });

  it('grows with the number of solvers, holding time constant', () => {
    const at = (n: number) => authorPoints(Array(n).fill({ ms: 15_000 }), WINDOW);
    expect(at(1)).toBeLessThan(at(2));
    expect(at(5)).toBeLessThan(at(6));
  });

  it('pays a clue that made people work more than an instant one', () => {
    const instant = authorPoints(Array(5).fill({ ms: 0 }), WINDOW);
    const worked = authorPoints(Array(5).fill({ ms: 21_000 }), WINDOW);
    expect(instant).toBe(500); // 5 × base — the literal-emoji clue
    expect(worked).toBe(1025); // 5 × (100 + 150×0.7)
    expect(worked).toBeGreaterThan(instant);
  });

  it('a five-person instant solve loses to a four-person slow one', () => {
    // The whole point: chasing solver count alone is no longer dominant.
    const obvious = authorPoints(Array(5).fill({ ms: 1_000 }), WINDOW);
    const clever = authorPoints(Array(4).fill({ ms: 24_000 }), WINDOW);
    expect(clever).toBeGreaterThan(obvious);
  });

  it('honors custom base/span', () => {
    const cfg = { ...DEFAULT_SCORING, authorSolveBase: 200, authorSolveSpan: 0 };
    expect(authorPoints([{ ms: 0 }, { ms: WINDOW }], WINDOW, cfg)).toBe(400);
  });
});

describe('bumpAward', () => {
  it('is zero with no bumps', () => {
    expect(bumpAward(0)).toBe(0);
  });

  it('pays the configured points per bump', () => {
    expect(bumpAward(3)).toBe(3 * DEFAULT_SCORING.bumpPoints);
  });
});
