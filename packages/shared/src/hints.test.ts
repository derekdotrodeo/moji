import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HINT_CONFIG,
  HINT_START_DELAY_MS,
  maskableIndices,
  planHintReveal,
  renderHint,
} from './hints.js';

/** Deterministic shuffle: always picks the last candidate, so order is stable. */
const fixedRng = () => 0.999999;

describe('hint masking', () => {
  it('masks letters and digits but leaves spaces and punctuation as structure', () => {
    expect(renderHint("Assassin's Creed", [])).toBe("________'_ _____");
    expect(renderHint('Ocean’s Eleven', [])).toBe('_____’_ ______');
    expect(renderHint('Portal', [])).toBe('______');
  });

  it('shows only the revealed indices', () => {
    // "Portal" -> reveal P (0) and a (4)
    expect(renderHint('Portal', [0, 4])).toBe('P___a_');
  });

  it('counts only maskable characters as slots', () => {
    expect(maskableIndices('Portal')).toHaveLength(6);
    expect(maskableIndices('The Sims')).toHaveLength(7); // the space is not a slot
    expect(maskableIndices("Assassin's Creed")).toHaveLength(14);
  });
});

describe('hint schedule', () => {
  const WINDOW = 30_000;

  it('reveals 75% of the letters', () => {
    const { order } = planHintReveal('Grand Theft Auto', WINDOW, fixedRng); // 14 letters
    expect(order).toHaveLength(Math.floor(14 * 0.75)); // 10
  });

  it('always leaves at least one letter hidden', () => {
    for (const answer of ['Go', 'Doom', 'Portal', 'A', 'Super Mario Bros.']) {
      const { order } = planHintReveal(answer, WINDOW, fixedRng);
      const hint = renderHint(answer, order);
      expect(hint).not.toBe(answer);
      expect(hint).toContain('_');
    }
  });

  it('waits out the initial delay, then spreads the rest across the window', () => {
    const { times } = planHintReveal('Grand Theft Auto', WINDOW, fixedRng);
    expect(times[0]).toBe(HINT_START_DELAY_MS);
    expect(times[times.length - 1]).toBeLessThan(WINDOW);
    // strictly increasing, evenly spaced
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 0);
  });

  it('reveals nothing when the window is shorter than the delay', () => {
    expect(planHintReveal('Portal', 4_000, fixedRng)).toEqual({ order: [], times: [] });
  });

  it('reveals nothing for an answer with too few letters to spare', () => {
    expect(planHintReveal('A', 30_000, fixedRng).order).toHaveLength(0);
  });

  it('scatters positions rather than running left to right', () => {
    let i = 0;
    const rng = () => [0.1, 0.9, 0.4, 0.7, 0.2, 0.55, 0.05, 0.8][i++ % 8]!;
    const { order } = planHintReveal('Minecraft', 30_000, rng);
    expect(order).not.toEqual([...order].sort((a, b) => a - b));
  });

  it('honours a custom config', () => {
    const cfg = { ...DEFAULT_HINT_CONFIG, revealFraction: 0.5, startDelayMs: 1_000 };
    const { order, times } = planHintReveal('Minecraft', 30_000, fixedRng, cfg); // 9 letters
    expect(order).toHaveLength(4);
    expect(times[0]).toBe(1_000);
  });
});
