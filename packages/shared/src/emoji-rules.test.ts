import { describe, expect, it } from 'vitest';
import { MAX_EMOJIS, promptHasNumber, validateClue } from './emoji-rules.js';

const base = { promptHasNumber: false } as const;

describe('validateClue — counts', () => {
  it('accepts a single valid emoji', () => {
    expect(validateClue(['🚢'], base).ok).toBe(true);
  });

  it('rejects an empty clue', () => {
    const res = validateClue([], base);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/at least/i);
  });

  it(`rejects more than ${MAX_EMOJIS} emojis`, () => {
    const tooMany = Array.from({ length: MAX_EMOJIS + 1 }, () => '🎬');
    const res = validateClue(tooMany, base);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/at most/i);
  });

  it(`accepts exactly ${MAX_EMOJIS} emojis`, () => {
    const max = Array.from({ length: MAX_EMOJIS }, () => '🎬');
    expect(validateClue(max, base).ok).toBe(true);
  });
});

describe('validateClue — content rules', () => {
  it('rejects plain text / letters', () => {
    expect(validateClue(['a'], base).ok).toBe(false);
    expect(validateClue(['🚢', 'X'], base).ok).toBe(false);
  });

  it('rejects letter emojis (lone regional indicator, squared letters)', () => {
    expect(validateClue(['🇦'], base).ok).toBe(false); // lone regional indicator A
    expect(validateClue(['🅰️'], base).ok).toBe(false); // squared A
  });

  it('allows complete country flags (a pair of regional indicators)', () => {
    expect(validateClue(['🇫🇷'], base).ok).toBe(true);
    expect(validateClue(['🇯🇵', '🍣'], base).ok).toBe(true);
  });

  it('rejects number/keycap emojis only when the prompt contains a number', () => {
    expect(validateClue(['1️⃣'], { promptHasNumber: true }).ok).toBe(false);
    expect(validateClue(['🔟'], { promptHasNumber: true }).ok).toBe(false);
    // when the prompt has no number, keycaps are allowed
    expect(validateClue(['1️⃣'], { promptHasNumber: false }).ok).toBe(true);
  });

  it('rejects multi-emoji entries (must be one grapheme each)', () => {
    expect(validateClue(['🚢🎬'], base).ok).toBe(false);
  });

  it('rejects clues that spell the answer via forbidden tokens (backstop)', () => {
    // Real emojis can't spell, but pasted/forced text that reconstructs the
    // answer is caught both as text and by the forbidden-token backstop.
    const res = validateClue(['c', 'a', 't'], {
      promptHasNumber: false,
      forbiddenTokens: ['cat'],
    });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/spell/i);
  });
});

describe('promptHasNumber', () => {
  it('detects digits in the answer', () => {
    expect(promptHasNumber('Toy Story 3')).toBe(true);
    expect(promptHasNumber('Titanic')).toBe(false);
  });
});
