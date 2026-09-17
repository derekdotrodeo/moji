/**
 * Guards on the bot's clue library.
 *
 * The bot plays these clues and guesses with them, so a bad entry here is both
 * a bad-looking opponent and a blind spot in its guessing. All four checks are
 * things that would otherwise only show up mid-demo.
 */
import { describe, expect, it } from 'vitest';
import { promptHasNumber, validateClue } from '@moji/shared';
import { BOT_CLUES, BOT_CLUE_ANSWERS } from './database/bot-clues.js';
import { PROMPT_DATABASE } from './database/prompt-database.js';
import { SEED_CATEGORIES } from './seedData.js';
import { SOLO_MIN_CLUED_PROMPTS, soloPackSlugs } from './solo.js';

describe('bot clue library', () => {
  it('only names answers that exist in the prompt database', () => {
    const answers = new Set(PROMPT_DATABASE.map((p) => p.answer));
    const unknown = BOT_CLUES.map((e) => e.answer).filter((a) => !answers.has(a));
    expect(unknown).toEqual([]);
  });

  it('holds one entry per answer', () => {
    const seen = new Set<string>();
    const dupes = BOT_CLUES.map((e) => e.answer).filter((a) =>
      seen.has(a) ? true : (seen.add(a), false),
    );
    expect(dupes).toEqual([]);
  });

  it('plays only clues the server would accept from a human', () => {
    // The bot goes through Room.submitClue like anybody else, so an invalid
    // clue isn't a cosmetic problem — the bot would fail to submit and its
    // clue would be skipped in the playback order.
    const rejected: string[] = [];
    for (const entry of BOT_CLUES) {
      for (const clue of entry.clues) {
        const result = validateClue(clue, {
          promptHasNumber: promptHasNumber(entry.answer),
          forbiddenTokens: [entry.answer],
        });
        if (!result.ok) rejected.push(`${entry.answer} — ${clue.join('')}: ${result.errors.join(' ')}`);
      }
    }
    expect(rejected).toEqual([]);
  });

  it('gives every answer more than one reading', () => {
    // Two variants is what stops a replay showing the same clue, and what
    // widens the emoji vocabulary the bot can recognise a human reaching for.
    const thin = BOT_CLUES.filter((e) => e.clues.length < 2).map((e) => e.answer);
    expect(thin).toEqual([]);
  });
});

describe('solo pack eligibility', () => {
  it('offers only packs with enough clued prompts for a full solo game', () => {
    const slugs = soloPackSlugs();
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const pack = SEED_CATEGORIES.find((c) => c.slug === slug)!;
      const clued = pack.prompts.filter((p) => BOT_CLUE_ANSWERS.has(p.answer));
      expect(clued.length).toBeGreaterThanOrEqual(SOLO_MIN_CLUED_PROMPTS);
    }
  });

  it('accounts for every clued answer in some solo pack', () => {
    // An answer with a clue that no solo pack can deal is authoring effort the
    // game will never show anyone.
    const dealable = new Set(
      soloPackSlugs().flatMap((slug) =>
        (SEED_CATEGORIES.find((c) => c.slug === slug)?.prompts ?? []).map((p) => p.answer),
      ),
    );
    const orphans = [...BOT_CLUE_ANSWERS].filter((a) => !dealable.has(a)).sort();
    expect(orphans).toEqual([]);
  });
});
