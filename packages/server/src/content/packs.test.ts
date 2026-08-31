/**
 * Guards on the pack registry.
 *
 * Packs are *hints* — they narrow the answer space, they don't partition it. A
 * title showing up under two packs is fine and often desirable. So the guard
 * here is deliberately not "every leaf belongs to exactly one pack"; it's the
 * two things that actually break a round.
 */
import { describe, expect, it } from 'vitest';
import { PACKS, PROMPT_DATABASE } from './database/prompt-database.js';
import { SEED_CATEGORIES } from './seedData.js';

/** Biggest table we expect to deal: 8 players over 3 rounds, no repeats. */
const FULL_GAME_PROMPTS = 8 * 3;

describe('pack registry', () => {
  it('leaves no prompt unreachable', () => {
    // A leaf in no pack is silently undealable — the prompt exists but can never
    // be dealt. Overlap is allowed; absence is not.
    const owned = new Set(PACKS.flatMap((p) => p.categories));
    const orphans = [...new Set(PROMPT_DATABASE.map((e) => e.category))]
      .filter((leaf) => !owned.has(leaf))
      .sort();
    expect(orphans).toEqual([]);
  });

  it('references only leaves that exist', () => {
    const leaves = new Set(PROMPT_DATABASE.map((e) => e.category));
    const dangling = [...new Set(PACKS.flatMap((p) => p.categories))]
      .filter((leaf) => !leaves.has(leaf))
      .sort();
    expect(dangling).toEqual([]);
  });

  it('never repeats an answer inside one pack', () => {
    // THE round-breaking case: a pack that can deal the same answer twice in a
    // single round. This is what makes pack overlap safe.
    const dupes = SEED_CATEGORIES.flatMap((cat) => {
      const seen = new Set<string>();
      return cat.prompts
        .filter((p) => (seen.has(p.answer) ? true : (seen.add(p.answer), false)))
        .map((p) => `${cat.name}: ${p.answer}`);
    });
    expect(dupes).toEqual([]);
  });

  it('has unique slugs and emoji', () => {
    expect(new Set(PACKS.map((p) => p.slug)).size).toBe(PACKS.length);
    expect(new Set(PACKS.map((p) => p.emoji)).size).toBe(PACKS.length);
  });

  it('gives every pack enough prompts for a full game', () => {
    const thin = SEED_CATEGORIES.filter((c) => c.prompts.length < FULL_GAME_PROMPTS).map(
      (c) => `${c.name} (${c.prompts.length})`,
    );
    expect(thin).toEqual([]);
  });
});
