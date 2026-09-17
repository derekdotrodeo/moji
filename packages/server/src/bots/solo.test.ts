/**
 * A whole solo game, wired the way RoomManager wires one: the bot is fed
 * `serializeRoomFor(snapshot, botId)` on every state change and acts only
 * through Room's guarded commands.
 *
 * The first test is the one that matters. If the serializer ever stopped
 * filtering by role, the bot would start winning every clue instantly — so this
 * is the anti-cheat boundary under test by an actual adversary, not by an
 * assertion about a payload shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCORING, type Player, type RoomView } from '@moji/shared';
import { Room, type RoomHooks } from '../rooms/Room.js';
import { serializeRoomFor } from '../realtime/serialize.js';
import type { ContentProvider, PromptForPlay } from '../content/ContentProvider.js';
import { botCluesFor } from '../content/database/bot-clues.js';
import { BotDriver } from './BotDriver.js';

const HUMAN_PROMPT: PromptForPlay = {
  id: 'p-lion',
  answer: 'The Lion King',
  accepted: ['The Lion King'],
  blocklist: [],
  difficulty: 1,
};
const BOT_PROMPT: PromptForPlay = {
  id: 'p-nemo',
  answer: 'Finding Nemo',
  accepted: ['Finding Nemo'],
  blocklist: [],
  difficulty: 1,
};

// Deals from a real solo pack so the bot's own index applies: the human gets
// The Lion King, the bot gets Finding Nemo, both from Disney.
const soloContent = {
  dealRound: () => ({
    category: { slug: 'disney', name: 'Disney' },
    assignments: [HUMAN_PROMPT, BOT_PROMPT],
  }),
  packs: () => [{ slug: 'disney', name: 'Disney', emoji: '🏰', group: 'Pop Culture' }],
  categorySlugsForPack: () => ['disney'],
  soloPackSlugs: () => ['disney'],
  drawOne: () => null,
} as unknown as ContentProvider;

interface SoloGame {
  room: Room;
  human: Player;
  bot: Player;
  /** Every view the bot was handed, in order. */
  botViews: RoomView[];
  driver: BotDriver;
}

function startSoloGame(): SoloGame {
  const botViews: RoomView[] = [];
  let driver: BotDriver | null = null;

  const hooks: RoomHooks = {
    onStateChange: (r) => {
      const snap = r.getSnapshot();
      for (const p of snap.players) {
        if (!p.isBot) continue;
        const view = serializeRoomFor(snap, p.id);
        botViews.push(view);
        driver?.onView(view);
      }
    },
    onGuess: () => {},
    onHint: () => {},
    onChat: () => {},
    onClosed: () => {},
  };

  const room = new Room('SOLO1', {
    content: soloContent,
    scoring: DEFAULT_SCORING,
    rng: () => 0.5,
    hooks,
  });
  room.config = { ...room.config, mode: 'solo', rounds: 2, clueCreationSeconds: 45 };

  const human = room.addPlayer('You', 'player');
  const bot = room.addPlayer('Mojibot', 'player', '🤖', true);
  driver = new BotDriver({
    commands: {
      submitClue: (emojis) => room.submitClue(bot.id, emojis),
      submitGuess: (text) => void room.submitGuess(bot.id, text),
      bump: () => room.bumpClue(bot.id),
      chat: (text) => room.sendClueChat(bot.id, text),
    },
    rng: () => 0.5,
  });

  room.start(human.id);
  vi.advanceTimersByTime(2000 + 3100); // ROUND_INTRO + PROMPT_ASSIGNMENT
  return { room, human, bot, botViews, driver };
}

describe('the bot plays from a role-filtered view', () => {
  let game: SoloGame;

  beforeEach(() => {
    vi.useFakeTimers();
    game = startSoloGame();
  });

  afterEach(() => {
    game.driver.dispose();
    vi.useRealTimers();
  });

  it('is never handed the answer to a clue it has not solved', () => {
    game.room.submitClue(game.human.id, ['🦁', '👑', '🌅']);
    vi.advanceTimersByTime(45_000 + 1500 + 30_000);

    const leaked = game.botViews.filter(
      (v) =>
        v.phase === 'GUESSING' &&
        v.activeClue &&
        !v.activeClue.youAreAuthor &&
        !v.activeClue.yourSolve &&
        v.activeClue.answer !== null,
    );
    expect(leaked).toEqual([]);
  });

  it("is never handed the human's prompt", () => {
    vi.advanceTimersByTime(45_000);
    const prompts = new Set(game.botViews.map((v) => v.yourPrompt));
    expect(prompts.has('The Lion King')).toBe(false);
    expect(prompts.has('Finding Nemo')).toBe(true);
  });

  it('never sees the solvers’ chat for a clue it is still guessing', () => {
    game.room.submitClue(game.human.id, ['🦁', '👑', '🌅']);
    vi.advanceTimersByTime(45_000 + 1500);
    const stillGuessing = game.botViews.filter(
      (v) => v.phase === 'GUESSING' && v.activeClue && !v.activeClue.yourSolve,
    );
    expect(stillGuessing.every((v) => v.clueChat.length === 0)).toBe(true);
  });
});

describe('the bot takes its turn', () => {
  let game: SoloGame;

  beforeEach(() => {
    vi.useFakeTimers();
    game = startSoloGame();
  });

  afterEach(() => {
    game.driver.dispose();
    vi.useRealTimers();
  });

  /**
   * Drive to the GUESSING phase of the FIRST clue (the human's).
   *
   * The clue-creation window is 45s, but it ends the moment both players have
   * submitted — so with the human submitting immediately, the round actually
   * turns over when the bot submits, a few seconds in. Advancing by the full
   * window would sail past this clue entirely and land on the bot's.
   */
  function toHumanClueGuessing(clue: string[]): void {
    game.room.submitClue(game.human.id, clue);
    // Step rather than jump, so the tests below measure from the top of the
    // guess window however the bot's authoring delay is later tuned.
    for (let i = 0; i < 400 && game.room.phase !== 'GUESSING'; i++) {
      vi.advanceTimersByTime(250);
    }
    expect(game.room.phase).toBe('GUESSING');
    expect(game.room.getSnapshot().active?.authorId).toBe(game.human.id);
  }

  it('authors one of its hand-written clues, inside the window', () => {
    toHumanClueGuessing(['🦁', '👑', '🌅']);
    // Past the human's clue (the bot solves it) and on to the bot's own.
    vi.advanceTimersByTime(6_000 + 4_000 + 1_500);

    const active = game.room.getSnapshot().active;
    expect(active?.authorId).toBe(game.bot.id);
    const variants = botCluesFor('Finding Nemo')!.map((c) => c.join(''));
    expect(variants).toContain(active!.emojis.join(''));
  });

  it('solves a literal clue fast, and that pays its author less', () => {
    // 🦁👑🌅 is the canonical Lion King clue — the bot is confident, so it
    // guesses early, which is exactly the clue the author curve punishes.
    toHumanClueGuessing(['🦁', '👑', '🌅']);
    vi.advanceTimersByTime(6_000);

    const snap = game.room.getSnapshot();
    const solve = snap.active!.solves.find((s) => s.playerId === game.bot.id);
    expect(solve).toBeDefined();
    expect(solve!.ms).toBeLessThan(15_000); // inside the first half of the window
    // 100 + 150 × (5.4s / 30s) ≈ 127, plus at most one 50-point bump.
    expect(snap.active!.authorPoints).toBeLessThan(200);
  });

  it('guesses wrong out loud when a clue means nothing to it', () => {
    // 🧦🪗🧮 appear in no clue in the library, so every candidate scores zero
    // and the bot is genuinely stumped rather than merely unlucky.
    toHumanClueGuessing(['🧦', '🪗', '🧮']);
    // Stumped means late, not silent: nothing has been guessed 20s in.
    vi.advanceTimersByTime(20_000);
    expect(game.room.getSnapshot().guessFeed).toEqual([]);

    vi.advanceTimersByTime(7_000);
    const feed = game.room.getSnapshot().guessFeed;
    // Its guesses land in the public feed like anyone's, and wrong ones keep
    // their text — only correct guesses are blanked.
    expect(feed.some((g) => g.guesserId === game.bot.id && !g.isCorrect)).toBe(true);
  });

  it('keeps bot solves out of the public clues-guessed counter', () => {
    // stats.ts sums this into the landing page's "N clues guessed". A bot
    // padding that number would make it the fiction it was written to replace.
    toHumanClueGuessing(['🦁', '👑', '🌅']);
    vi.advanceTimersByTime(6_000);
    const snap = game.room.getSnapshot();
    expect(snap.active!.solves.some((s) => s.playerId === game.bot.id)).toBe(true);
    expect(snap.cluesGuessed).toBe(0);
  });

  it('applauds a clue once it is entitled to the answer, never before', () => {
    // A clue it never cracks: it cannot bump while it is still guessing, and
    // the server would refuse if it tried. Once the clue resolves and it is
    // shown the answer, the same guard opens and it pays the author.
    toHumanClueGuessing(['🧦', '🪗', '🧮']);
    vi.advanceTimersByTime(29_000);
    expect(game.room.phase).toBe('GUESSING');
    expect(game.room.getSnapshot().active!.bumps.size).toBe(0);

    vi.advanceTimersByTime(1_000 + 2_000); // buzzer, then CLUE_SCORING
    expect(game.room.phase).toBe('CLUE_SCORING');
    expect(game.room.getSnapshot().active!.bumps.has(game.bot.id)).toBe(true);
  });

  it('plays a two-round game to a result without any further human input', () => {
    game.room.submitClue(game.human.id, ['🦁', '👑', '🌅']);
    // Round 1 plays both clues; round 2 plays the bot's alone, because the
    // human sits it out. Then the round-results beat and the game end.
    vi.advanceTimersByTime(400_000);
    const snap = game.room.getSnapshot();
    expect(snap.phase).toBe('GAME_RESULTS');
    expect(snap.gameResults).not.toBeNull();
    expect(snap.gameResults!.length).toBe(2);
  });
});
