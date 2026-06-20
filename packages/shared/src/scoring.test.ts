import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING, authorPoints, guesserPoints } from './scoring.js';

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

describe('authorPoints (proportional to solves)', () => {
  it('is zero when nobody solves', () => {
    expect(authorPoints(0)).toBe(0);
  });

  it('grows with the number of solvers', () => {
    expect(authorPoints(1)).toBe(130);
    expect(authorPoints(5)).toBe(650); // matches the design example
    expect(authorPoints(6)).toBeGreaterThan(authorPoints(5));
  });

  it('honors a custom per-solve value', () => {
    expect(authorPoints(3, { ...DEFAULT_SCORING, authorPerSolve: 100 })).toBe(300);
  });
});
