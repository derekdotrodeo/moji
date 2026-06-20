import { describe, expect, it } from 'vitest';
import { editDistance, isCorrectGuess, normalize } from './guessMatching.js';

describe('normalize', () => {
  it('lowercases, strips punctuation, and drops leading articles', () => {
    expect(normalize('The Matrix!')).toBe('matrix');
    expect(normalize('  Pac-Man  ')).toBe('pac man');
  });

  it('strips diacritics', () => {
    expect(normalize('Pokémon')).toBe('pokemon');
  });
});

describe('editDistance', () => {
  it('computes basic distances', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
  });
});

describe('isCorrectGuess', () => {
  const spec = { accepted: ['The Matrix', 'Matrix'] };

  it('accepts the canonical answer regardless of case/articles', () => {
    expect(isCorrectGuess('the matrix', spec)).toBe(true);
    expect(isCorrectGuess('MATRIX', spec)).toBe(true);
  });

  it('accepts aliases', () => {
    expect(isCorrectGuess('matrix', { accepted: ['The Matrix', 'Matrix'] })).toBe(true);
  });

  it('tolerates small typos on longer answers', () => {
    expect(isCorrectGuess('jurasic park', { accepted: ['Jurassic Park'] })).toBe(true);
  });

  it('does not over-accept short, distinct answers', () => {
    expect(isCorrectGuess('cat', { accepted: ['Cars'] })).toBe(false);
  });

  it('rejects clearly wrong guesses', () => {
    expect(isCorrectGuess('inception', spec)).toBe(false);
  });

  it('does not accept a partial-word guess for a multi-word title', () => {
    // typo-forgiveness must not become partial credit
    expect(isCorrectGuess('mario', { accepted: ['Super Mario Bros'] })).toBe(false);
    expect(isCorrectGuess('lion', { accepted: ['The Lion King'] })).toBe(false);
    expect(isCorrectGuess('star', { accepted: ['Star Wars'] })).toBe(false);
  });

  it('rejects empty guesses', () => {
    expect(isCorrectGuess('   ', spec)).toBe(false);
  });

  it('honors the blocklist for confusable titles', () => {
    const blocked = { accepted: ['Cars 2'], blocklist: ['Cars'] };
    expect(isCorrectGuess('Cars', blocked)).toBe(false);
  });
});
