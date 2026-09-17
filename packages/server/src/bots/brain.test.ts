/**
 * The bot's decision-making, tested without a room.
 *
 * The behavioural claim worth protecting is the timing one: the bot's
 * confidence has to drive *when* it guesses, because that is what makes it
 * enforce the author-points curve instead of merely simulating an opponent.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOT_TUNING,
  buildEmojiIndex,
  clueSubmitDelayMs,
  firstGuessFraction,
  pickClue,
  planGuesses,
  rankCandidates,
} from './brain.js';
import { BOT_CLUES, botCluesFor } from '../content/database/bot-clues.js';
import { cluedAnswersByPack } from '../content/solo.js';

const FIXTURE = [
  { answer: 'Shark Film', clues: [['🦈', '🌊', '🏖️']] },
  { answer: 'Boat Film', clues: [['🚢', '🧊', '🌊']] },
  { answer: 'Desert Film', clues: [['🏜️', '🐛', '🌊']] },
];

/** rng at 0.5 zeroes the jitter, so scheduled times are exact. */
const steady = () => 0.5;

describe('emoji index', () => {
  it('weights a rare emoji above one every clue uses', () => {
    const index = buildEmojiIndex(FIXTURE);
    // 🌊 appears in all three answers; 🦈 in one.
    expect(index.idf.get('🦈')!).toBeGreaterThan(index.idf.get('🌊')!);
  });

  it('counts an emoji once per answer, however many variants use it', () => {
    const twice = buildEmojiIndex([{ answer: 'A', clues: [['🦈'], ['🦈', '🌊']] }]);
    expect(twice.vocabulary.get('A')).toEqual(new Set(['🦈', '🌊']));
  });
});

describe('ranking candidates', () => {
  const index = buildEmojiIndex(FIXTURE);
  const all = FIXTURE.map((f) => f.answer);

  it('puts the matching answer first for its own clue', () => {
    expect(rankCandidates(['🦈', '🌊', '🏖️'], all, index)[0]!.answer).toBe('Shark Film');
  });

  it('scores nothing when no emoji overlap at all', () => {
    const ranked = rankCandidates(['🎺', '🧦'], all, index);
    expect(ranked.every((c) => c.score === 0)).toBe(true);
  });

  it('ignores emoji it has never seen rather than breaking the score', () => {
    const withNoise = rankCandidates(['🦈', '🫎', '🛼'], all, index);
    expect(withNoise[0]!.answer).toBe('Shark Film');
    expect(withNoise[0]!.score).toBeGreaterThan(0);
  });

  it('is unmoved by the order the candidates arrive in', () => {
    const forward = rankCandidates(['🚢', '🧊'], all, index).map((c) => c.answer);
    const reverse = rankCandidates(['🚢', '🧊'], [...all].reverse(), index).map((c) => c.answer);
    expect(forward).toEqual(reverse);
  });

  it('finds the real answer from its own library clue, inside its own pack', () => {
    // End-to-end on the shipped content: a canonical clue should retrieve its
    // own title out of a pack of ~34 candidates.
    const index = buildEmojiIndex(BOT_CLUES);
    const disney = cluedAnswersByPack().get('disney')!;
    for (const answer of ['The Lion King', 'Finding Nemo', 'Toy Story']) {
      const clue = botCluesFor(answer)![0]!;
      expect(rankCandidates(clue, disney, index)[0]!.answer).toBe(answer);
    }
  });
});

describe('confidence drives timing', () => {
  it('guesses early when sure and late when stumped', () => {
    const sure = firstGuessFraction(0.9);
    const stumped = firstGuessFraction(0);
    expect(sure).toBeCloseTo(DEFAULT_BOT_TUNING.fastestFraction);
    expect(stumped).toBeCloseTo(DEFAULT_BOT_TUNING.slowestFraction);
    expect(sure).toBeLessThan(stumped);
  });

  it('moves monotonically between those two ends', () => {
    const fractions = [0, 0.1, 0.2, 0.3, 0.45, 0.8].map((c) => firstGuessFraction(c));
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]!).toBeLessThanOrEqual(fractions[i - 1]!);
    }
  });

  it('pays the author more for a clue it has to work at', () => {
    // The whole point of the timing model, stated as the scoring consequence:
    // a literal clue is cracked early and earns its author little.
    const index = buildEmojiIndex(FIXTURE);
    const all = FIXTURE.map((f) => f.answer);
    const obvious = planGuesses(rankCandidates(['🦈', '🌊', '🏖️'], all, index), 30_000, undefined, steady);
    const oblique = planGuesses(rankCandidates(['🎺', '🧦'], all, index), 30_000, undefined, steady);
    expect(obvious[0]!.atMs).toBeLessThan(oblique[0]!.atMs);
  });
});

describe('guess plans', () => {
  const index = buildEmojiIndex(FIXTURE);
  const all = FIXTURE.map((f) => f.answer);

  it('guesses in rank order, spaced past the room rate limit', () => {
    const plan = planGuesses(rankCandidates(['🌊'], all, index), 30_000, undefined, steady);
    expect(plan.length).toBeGreaterThan(1);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i]!.atMs - plan[i - 1]!.atMs).toBeGreaterThan(500);
    }
  });

  it('never schedules a guess the buzzer would reject', () => {
    const plan = planGuesses(rankCandidates(['🎺'], all, index), 10_000, undefined, steady);
    for (const guess of plan) {
      expect(guess.atMs).toBeLessThanOrEqual(10_000 * DEFAULT_BOT_TUNING.lastCallFraction);
    }
  });

  it('still guesses when it recognises nothing', () => {
    // Stumped is not silent: an honest bot guesses badly rather than abstaining,
    // which is also what keeps the guess feed alive in a solo room.
    const plan = planGuesses(rankCandidates(['🎺', '🧦'], all, index), 30_000, undefined, steady);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('caps how many guesses one clue gets', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ answer: `A${i}`, score: 1 - i / 100 }));
    expect(planGuesses(many, 60_000, undefined, steady).length).toBeLessThanOrEqual(
      DEFAULT_BOT_TUNING.maxGuesses,
    );
  });

  it('plans nothing without candidates or without a window', () => {
    expect(planGuesses([], 30_000, undefined, steady)).toEqual([]);
    expect(planGuesses(rankCandidates(['🦈'], all, index), 0, undefined, steady)).toEqual([]);
  });
});

describe('clue choice', () => {
  it('submits inside the creation window', () => {
    const delay = clueSubmitDelayMs(45_000, DEFAULT_BOT_TUNING, steady);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThan(45_000);
  });

  it('prefers a variant it has not played this game', () => {
    const clues = [['🦈'], ['🌊']];
    expect(pickClue(clues, new Set(['🦈']), steady)).toEqual(['🌊']);
  });

  it('replays rather than refusing once every variant is used', () => {
    const clues = [['🦈'], ['🌊']];
    expect(pickClue(clues, new Set(['🦈', '🌊']), steady)).not.toBeNull();
  });
});
