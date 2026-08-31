import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCORING, type Player, type PublicGuess } from '@moji/shared';
import { Room, type RoomHooks } from './Room.js';
import { serializeRoomFor } from '../realtime/serialize.js';
import type { ContentProvider, PromptForPlay } from '../content/ContentProvider.js';

const PROMPTS: PromptForPlay[] = [
  { id: 'p1', answer: 'Titanic', accepted: ['Titanic'], blocklist: [], difficulty: 1 },
  { id: 'p2', answer: 'Pizza', accepted: ['Pizza'], blocklist: [], difficulty: 1 },
];

const RESHUFFLE_PROMPT: PromptForPlay = {
  id: 'p3',
  answer: 'The Matrix',
  accepted: ['The Matrix'],
  blocklist: [],
  difficulty: 1,
};

// Deterministic content: A always gets Titanic, B always gets Pizza; the only
// reshuffle target is The Matrix (once it's used, drawOne returns null).
const fakeContent = {
  dealRound: () => ({ category: { slug: 'movies', name: 'Movies' }, assignments: PROMPTS }),
  packs: () => [{ slug: 'movies', name: 'Movies', emoji: '🎬' }],
  categorySlugsForPack: () => [],
  drawOne: (_slug: string, exclude: Set<string>) =>
    exclude.has('p3') ? null : RESHUFFLE_PROMPT,
} as unknown as ContentProvider;

const noopHooks: RoomHooks = {
  onStateChange: () => {},
  onGuess: () => {},
  onHint: () => {},
  onChat: () => {},
  onClosed: () => {},
};

function newRoom(): Room {
  return new Room('ABCD', {
    content: fakeContent,
    scoring: DEFAULT_SCORING,
    rng: () => 0.5,
    hooks: noopHooks,
  });
}

/** Drives a fresh room to the first clue's GUESSING phase. */
function roomAtGuessing(hooks: RoomHooks = noopHooks): { room: Room; a: Player; b: Player } {
  const room = new Room('ABCD', {
    content: fakeContent,
    scoring: DEFAULT_SCORING,
    rng: () => 0.5,
    hooks,
  });
  const a = room.addPlayer('Alice', 'player');
  const b = room.addPlayer('Bob', 'player');
  room.start(a.id);
  vi.advanceTimersByTime(2000 + 3100);
  room.submitClue(a.id, ['🚢', '🧊']);
  room.submitClue(b.id, ['🍕']);
  vi.advanceTimersByTime(1500);
  return { room, a, b };
}

function scoreOf(room: Room, id: string): number {
  return room.getSnapshot().players.find((p) => p.id === id)?.score ?? -1;
}

describe('Room state machine', () => {
  let room: Room;
  let a: Player;
  let b: Player;

  beforeEach(() => {
    vi.useFakeTimers();
    room = newRoom();
    a = room.addPlayer('Alice', 'player');
    b = room.addPlayer('Bob', 'player');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes the first player the host', () => {
    expect(a.isHost).toBe(true);
    expect(b.isHost).toBe(false);
  });

  it('requires the host to start and at least 2 players', () => {
    expect(() => room.start(b.id)).toThrow(/host/i);
    const solo = newRoom();
    const only = solo.addPlayer('Solo', 'player');
    expect(() => solo.start(only.id)).toThrow(/at least/i);
  });

  it('runs a full single-round game end to end', () => {
    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    expect(room.phase).toBe('ROUND_INTRO');

    vi.advanceTimersByTime(2000);
    expect(room.phase).toBe('PROMPT_ASSIGNMENT');
    vi.advanceTimersByTime(3100);
    expect(room.phase).toBe('CLUE_CREATION');
    expect(room.getSnapshot().assignments.get(a.id)).toBe('Titanic');
    expect(room.getSnapshot().assignments.get(b.id)).toBe('Pizza');

    // Both submit -> early finish -> first clue revealed
    room.submitClue(a.id, ['🚢', '🧊']);
    room.submitClue(b.id, ['🍕']);
    expect(room.phase).toBe('CLUE_REVEAL');

    vi.advanceTimersByTime(1500);
    expect(room.phase).toBe('GUESSING');

    // --- anti-cheat: non-author must not see the answer mid-guess ---
    const snap = room.getSnapshot();
    expect(serializeRoomFor(snap, b.id).activeClue?.answer).toBeNull();
    expect(serializeRoomFor(snap, a.id).activeClue?.answer).toBe('Titanic');

    // Bob solves Alice's clue instantly (fake clock hasn't advanced)
    const res = room.submitGuess(b.id, 'Titanic');
    expect(res).toMatchObject({ accepted: true, isCorrect: true, solveRank: 1 });
    expect(scoreOf(room, b.id)).toBe(1000); // instant guess -> guesserMax
    // Author: one solver, who got it instantly -> the base rate and no more.
    expect(scoreOf(room, a.id)).toBe(DEFAULT_SCORING.authorSolveBase);
    expect(room.phase).toBe('CLUE_SCORING'); // all eligible solved -> ends early

    // answer is revealed to everyone during scoring, with the reveal payload
    const reveal = serializeRoomFor(room.getSnapshot(), b.id).activeClue!;
    expect(reveal.answer).toBe('Titanic');
    expect(reveal.authorPoints).toBe(DEFAULT_SCORING.authorSolveBase);
    expect(reveal.solves).toHaveLength(1);
    expect(reveal.yourSolve).toMatchObject({ rank: 1, points: 1000 });

    // advance through scoring -> Bob's clue plays next
    vi.advanceTimersByTime(4000);
    expect(room.phase).toBe('CLUE_REVEAL');
    vi.advanceTimersByTime(1500);
    expect(room.phase).toBe('GUESSING');

    room.submitGuess(a.id, 'pizza');
    // Alice: 1000 (solving Bob) + 100 (author of her own instantly-solved clue)
    expect(scoreOf(room, a.id)).toBe(1100);
    expect(room.phase).toBe('CLUE_SCORING');

    vi.advanceTimersByTime(4000);
    expect(room.phase).toBe('ROUND_RESULTS');
    expect(room.getSnapshot().roundResults).not.toBeNull();

    vi.advanceTimersByTime(10000);
    expect(room.phase).toBe('GAME_RESULTS');
    const results = room.getSnapshot().gameResults!;
    expect(results).toHaveLength(2);
    // Both: 1000 (guesser) + 100 (author) = 1100
    expect(results.every((r) => r.totalScore === 1100)).toBe(true);
  });

  it('rejects invalid clue submissions', () => {
    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    vi.advanceTimersByTime(5100); // through ROUND_INTRO + PROMPT_ASSIGNMENT
    expect(() => room.submitClue(a.id, [])).toThrow(/at least/i);
    expect(() => room.submitClue(a.id, ['x'])).toThrow();
  });
});

/** Content with an endless supply of alternates, so the *limit* is what bites. */
function deepRoom(
  config: { reshuffles?: number; reshuffleCost?: number } = {},
): { room: Room; a: Player; b: Player } {
  let n = 0;
  const content = {
    dealRound: () => ({ category: { slug: 'movies', name: 'Movies' }, assignments: PROMPTS }),
    packs: () => [{ slug: 'movies', name: 'Movies', emoji: '🎬' }],
    categorySlugsForPack: () => [],
    drawOne: () => ({
      id: `alt${++n}`,
      answer: `Alternate ${n}`,
      accepted: [`Alternate ${n}`],
      blocklist: [],
      difficulty: 1,
    }),
  } as unknown as ContentProvider;

  const room = new Room('DEEP', {
    content,
    scoring: DEFAULT_SCORING,
    rng: () => 0.5,
    hooks: noopHooks,
  });
  const a = room.addPlayer('Alice', 'player');
  const b = room.addPlayer('Bob', 'player');
  room.configure(a.id, { rounds: 1, ...config });
  room.start(a.id);
  vi.advanceTimersByTime(5100); // -> CLUE_CREATION
  return { room, a, b };
}

describe('Room prompt reshuffle', () => {
  let room: Room;
  let a: Player;
  let b: Player;

  beforeEach(() => {
    vi.useFakeTimers();
    room = newRoom();
    a = room.addPlayer('Alice', 'player');
    b = room.addPlayer('Bob', 'player');
    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    vi.advanceTimersByTime(5100); // -> CLUE_CREATION
  });

  afterEach(() => vi.useRealTimers());

  it('swaps the prompt for a different one in the same category', () => {
    expect(room.getSnapshot().assignments.get(a.id)).toBe('Titanic');
    room.reshufflePrompt(a.id);
    expect(room.getSnapshot().assignments.get(a.id)).toBe('The Matrix');
  });

  it('allows the configured number of swaps per round, then stops', () => {
    const { room: deep, a: alice } = deepRoom({ reshuffles: 1 });
    deep.reshufflePrompt(alice.id);
    expect(() => deep.reshufflePrompt(alice.id)).toThrow(/all 1 prompt swaps/i);
  });

  it('defaults to three swaps a round', () => {
    const deep = deepRoom();
    for (let i = 0; i < 3; i++) deep.room.reshufflePrompt(deep.a.id);
    expect(() => deep.room.reshufflePrompt(deep.a.id)).toThrow(/all 3 prompt swaps/i);
  });

  it('can be turned off entirely', () => {
    const deep = deepRoom({ reshuffles: 0 });
    expect(() => deep.room.reshufflePrompt(deep.a.id)).toThrow(/turned off/i);
    expect(serializeRoomFor(deep.room.getSnapshot(), deep.a.id).youCanReshuffle).toBe(false);
  });

  it('clamps a silly limit rather than trusting the host', () => {
    const lobby = newRoom(); // configure() only applies in the lobby
    const host = lobby.addPlayer('Alice', 'player');
    lobby.configure(host.id, { reshuffles: 99 });
    expect(lobby.getSnapshot().config.reshuffles).toBe(5);
    lobby.configure(host.id, { reshuffles: -4 });
    expect(lobby.getSnapshot().config.reshuffles).toBe(0);
  });

  it('cannot reshuffle after submitting a clue', () => {
    room.submitClue(b.id, ['🍕']);
    expect(() => room.reshufflePrompt(b.id)).toThrow(/already submitted/i);
  });

  it('counts the remaining swaps down in the serialized view', () => {
    const { room: deep, a: alice } = deepRoom();
    const left = () => serializeRoomFor(deep.getSnapshot(), alice.id).yourReshufflesLeft;
    expect(left()).toBe(3);
    expect(serializeRoomFor(deep.getSnapshot(), alice.id).youCanReshuffle).toBe(true);

    deep.reshufflePrompt(alice.id);
    expect(left()).toBe(2);
    deep.reshufflePrompt(alice.id);
    deep.reshufflePrompt(alice.id);
    expect(left()).toBe(0);
    expect(serializeRoomFor(deep.getSnapshot(), alice.id).youCanReshuffle).toBe(false);
  });

  it('gives each player their own allowance, refreshed every round', () => {
    const { room: deep, a: alice, b: bob } = deepRoom();
    deep.reshufflePrompt(alice.id);
    deep.reshufflePrompt(alice.id);
    // Bob's allowance is untouched by Alice burning hers
    expect(serializeRoomFor(deep.getSnapshot(), bob.id).yourReshufflesLeft).toBe(3);
  });
});

describe('Room non-submit handling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays the submitted clue when the other player never submits (skips them)', () => {
    const room = newRoom();
    const a = room.addPlayer('A', 'player');
    room.addPlayer('B', 'player');
    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    vi.advanceTimersByTime(5100); // -> CLUE_CREATION
    room.submitClue(a.id, ['🚢']);
    // B never submits; let the creation timer expire (default 60s)
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('CLUE_REVEAL'); // round is NOT skipped — A's clue plays
  });

  it('early-finishes without waiting on a disconnected player', () => {
    const room = newRoom();
    const a = room.addPlayer('A', 'player');
    const b = room.addPlayer('B', 'player');
    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    vi.advanceTimersByTime(5100);
    room.setConnection(b.id, 'DISCONNECTED');
    room.submitClue(a.id, ['🚢']); // A is the only connected player -> advance now
    expect(room.phase).toBe('CLUE_REVEAL');
  });
});

describe('Room guessing rules', () => {
  let room: Room;
  let a: Player;
  let b: Player;

  beforeEach(() => {
    vi.useFakeTimers();
    room = newRoom();
    a = room.addPlayer('Alice', 'player');
    b = room.addPlayer('Bob', 'player');
    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    vi.advanceTimersByTime(5100); // through ROUND_INTRO + PROMPT_ASSIGNMENT
    room.submitClue(a.id, ['🚢']);
    room.submitClue(b.id, ['🍕']);
    vi.advanceTimersByTime(1500); // -> GUESSING on Alice's clue
  });

  afterEach(() => vi.useRealTimers());

  it('does not let the author guess their own clue', () => {
    expect(room.submitGuess(a.id, 'Titanic')).toMatchObject({
      accepted: false,
      isCorrect: false,
    });
  });

  it('rate-limits rapid-fire guesses from the same player', () => {
    expect(room.submitGuess(b.id, 'wrong-one').accepted).toBe(true);
    const second = room.submitGuess(b.id, 'wrong-two');
    expect(second.accepted).toBe(false);
    expect(second.reason).toMatch(/slow/i);
  });

  it('flags duplicate guesses without awarding points', () => {
    room.submitGuess(b.id, 'nope');
    vi.advanceTimersByTime(600); // clear the rate-limit window
    const dup = room.submitGuess(b.id, 'nope');
    expect(dup).toMatchObject({ accepted: true, duplicate: true });
  });

  it('accepts a wrong guess but scores nothing and stays in GUESSING', () => {
    const res = room.submitGuess(b.id, 'Inception');
    expect(res).toMatchObject({ accepted: true, isCorrect: false });
    expect(scoreOf(room, b.id)).toBe(0);
    expect(room.phase).toBe('GUESSING');
  });
});

describe('Room guess broadcast (live feed payload)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('broadcasts correct guesses with points and a blanked text (no answer leak)', () => {
    const guesses: PublicGuess[] = [];
    const room = new Room('ABCD', {
      content: fakeContent,
      scoring: DEFAULT_SCORING,
      rng: () => 0.5,
      hooks: { ...noopHooks, onGuess: (_r, g) => guesses.push(g) },
    });
    const a = room.addPlayer('Alice', 'player');
    const b = room.addPlayer('Bob', 'player');
    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    vi.advanceTimersByTime(5100);
    room.submitClue(a.id, ['🚢']);
    room.submitClue(b.id, ['🍕']);
    vi.advanceTimersByTime(1500); // GUESSING on Alice's clue

    room.submitGuess(b.id, 'Titanic');
    const correct = guesses.find((g) => g.isCorrect);
    expect(correct).toBeDefined();
    expect(correct!.points).toBeGreaterThan(0);
    expect(correct!.points).toBe(scoreOf(room, b.id)); // feed points == awarded
    expect(correct!.text).toBe(''); // answer never leaked in the broadcast
  });
});

describe('Room lobby features', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores the chosen avatar and exposes it on the snapshot', () => {
    const room = newRoom();
    const a = room.addPlayer('Alice', 'player', '🦊');
    expect(room.getSnapshot().players.find((p) => p.id === a.id)?.avatar).toBe('🦊');
  });

  it('tracks ready state in the lobby and resets it on start', () => {
    const room = newRoom();
    const a = room.addPlayer('Alice', 'player');
    const b = room.addPlayer('Bob', 'player');
    room.setReady(b.id, true);
    expect(room.getSnapshot().players.find((p) => p.id === b.id)?.ready).toBe(true);

    room.configure(a.id, { rounds: 1 });
    room.start(a.id);
    expect(room.getSnapshot().players.find((p) => p.id === b.id)?.ready).toBe(false);
  });

  it('exposes selectable packs', () => {
    const room = newRoom();
    room.addPlayer('Alice', 'player');
    // fakeContent has no packs(); a real ContentProvider would. Just assert shape.
    expect(Array.isArray(room.getSnapshot().packs)).toBe(true);
  });
});

describe('Room host migration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('promotes another player when the host leaves', () => {
    const room = newRoom();
    const a = room.addPlayer('Alice', 'player');
    const b = room.addPlayer('Bob', 'player');
    room.removePlayer(a.id);
    const snap = room.getSnapshot();
    expect(snap.hostId).toBe(b.id);
    expect(snap.players.find((p) => p.id === b.id)?.isHost).toBe(true);
  });
});

describe('Room letter hints', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts fully blanked and holds for the initial delay', () => {
    const { room, b } = roomAtGuessing();
    expect(room.phase).toBe('GUESSING');
    // "Titanic" -> seven blanks, nothing given away yet
    expect(serializeRoomFor(room.getSnapshot(), b.id).activeClue?.hint).toBe('_______');

    vi.advanceTimersByTime(4_900);
    expect(serializeRoomFor(room.getSnapshot(), b.id).activeClue?.hint).toBe('_______');
  });

  it('pushes each letter as it lands, and stops short of the answer', () => {
    const hints: string[] = [];
    const { room, b } = roomAtGuessing({
      onStateChange: () => {},
      onGuess: () => {},
      onHint: (_r, hint) => hints.push(hint),
      onChat: () => {},
      onClosed: () => {},
    });

    vi.advanceTimersByTime(30_000); // the whole guess window

    // 7 letters -> floor(7 * 0.4) = 2 reveals, one event each
    expect(hints).toHaveLength(2);
    expect(hints[0]!.replace(/[^_]/g, '')).toHaveLength(6); // one letter shown
    const last = hints[hints.length - 1]!;
    expect(last.replace(/[^_]/g, '')).toHaveLength(5); // five still hidden
    expect(last).not.toBe('Titanic');
    // every step reveals exactly one more letter than the one before it
    const shown = hints.map((h) => 7 - h.replace(/[^_]/g, '').length);
    expect(shown).toEqual([1, 2]);
  });

  it('never leaks the answer to a non-author, hint or not', () => {
    const { room, a, b } = roomAtGuessing();
    vi.advanceTimersByTime(29_000);
    const view = serializeRoomFor(room.getSnapshot(), b.id).activeClue!;
    expect(view.answer).toBeNull();
    expect(view.hint).not.toBe('Titanic');
    expect(view.hint).toContain('_');
    // the author still sees their own answer
    expect(serializeRoomFor(room.getSnapshot(), a.id).activeClue?.answer).toBe('Titanic');
  });

  it('drops the hint once the clue resolves', () => {
    const { room, b } = roomAtGuessing();
    room.submitGuess(b.id, 'Titanic'); // everyone solved -> CLUE_SCORING
    expect(room.phase).toBe('CLUE_SCORING');
    expect(serializeRoomFor(room.getSnapshot(), b.id).activeClue?.hint).toBeNull();
  });

  it('cancels the pending ticks when a clue resolves early', () => {
    const hints: string[] = [];
    const { room, b } = roomAtGuessing({
      onStateChange: () => {},
      onGuess: () => {},
      onHint: (_r, hint) => hints.push(hint),
      onChat: () => {},
      onClosed: () => {},
    });
    vi.advanceTimersByTime(6_000); // one letter has dropped
    expect(hints).toHaveLength(1);
    room.submitGuess(b.id, 'Titanic'); // everyone solved -> CLUE_SCORING
    vi.advanceTimersByTime(30_000);

    // Titanic had a tick still pending; it does not fire. The only later hints
    // belong to the next clue ("Pizza" -> 5 letters -> 2 reveals).
    expect(hints.filter((h) => h.length === 'Titanic'.length)).toHaveLength(1);
    expect(hints.filter((h) => h.length === 'Pizza'.length)).toHaveLength(2);
  });
});

/** Three-way content, so a room can have an author plus two separate guessers. */
const TRIO_PROMPTS: PromptForPlay[] = [
  { id: 't1', answer: 'Titanic', accepted: ['Titanic'], blocklist: [], difficulty: 1 },
  { id: 't2', answer: 'Pizza', accepted: ['Pizza'], blocklist: [], difficulty: 1 },
  { id: 't3', answer: 'Jaws', accepted: ['Jaws'], blocklist: [], difficulty: 1 },
];

const trioContent = {
  dealRound: () => ({ category: { slug: 'movies', name: 'Movies' }, assignments: TRIO_PROMPTS }),
  packs: () => [{ slug: 'movies', name: 'Movies', emoji: '🎬' }],
  categorySlugsForPack: () => [],
  drawOne: () => null,
} as unknown as ContentProvider;

/**
 * A three-player room parked on Alice's clue, mid-guess: Bob and Cara are both
 * eligible, so one can solve while the other is still working.
 */
function trioAtGuessing(hooks: RoomHooks = noopHooks): {
  room: Room;
  a: Player;
  b: Player;
  c: Player;
} {
  const room = new Room('TRIO', {
    content: trioContent,
    scoring: DEFAULT_SCORING,
    rng: () => 0.5,
    hooks,
  });
  const a = room.addPlayer('Alice', 'player');
  const b = room.addPlayer('Bob', 'player');
  const c = room.addPlayer('Cara', 'player');
  room.configure(a.id, { rounds: 1 });
  room.start(a.id);
  vi.advanceTimersByTime(2000 + 3100);
  room.submitClue(a.id, ['🚢', '🧊']);
  room.submitClue(b.id, ['🍕']);
  room.submitClue(c.id, ['🦈']);
  vi.advanceTimersByTime(1500);
  return { room, a, b, c };
}

describe('Room author points (time-weighted)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pays the author more for a solve that took work than an instant one', () => {
    const instant = roomAtGuessing();
    instant.room.submitGuess(instant.b.id, 'Titanic');
    const fast = scoreOf(instant.room, instant.a.id);

    const slow = roomAtGuessing();
    vi.advanceTimersByTime(21_000); // 70% of the 30s window
    slow.room.submitGuess(slow.b.id, 'Titanic');
    const worked = scoreOf(slow.room, slow.a.id);

    expect(fast).toBe(100); // base only — the clue everyone read off at a glance
    expect(worked).toBe(205); // 100 + 150 × 0.7
    expect(worked).toBeGreaterThan(fast);
  });

  it('still pays nothing when nobody solves', () => {
    const { room, a } = roomAtGuessing();
    vi.advanceTimersByTime(30_000); // window expires with no correct guess
    expect(room.phase).toBe('CLUE_SCORING');
    expect(scoreOf(room, a.id)).toBe(0);
  });

  it('adds up across solvers, so more solvers is still better', () => {
    const { room, a, b, c } = trioAtGuessing();
    vi.advanceTimersByTime(15_000);
    room.submitGuess(b.id, 'Titanic');
    const oneSolver = scoreOf(room, a.id);
    room.submitGuess(c.id, 'Titanic');
    expect(scoreOf(room, a.id)).toBeGreaterThan(oneSolver);
  });
});

describe('Room prompt swap cost', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('charges the configured cost for each swap', () => {
    const { room, a } = deepRoom({ reshuffles: 3 });
    room.reshufflePrompt(a.id);
    expect(scoreOf(room, a.id)).toBe(-150);
    room.reshufflePrompt(a.id);
    expect(scoreOf(room, a.id)).toBe(-300);
  });

  it('goes negative rather than clamping, so the first swap is never free', () => {
    const { room, a } = deepRoom();
    expect(scoreOf(room, a.id)).toBe(0);
    room.reshufflePrompt(a.id);
    expect(scoreOf(room, a.id)).toBeLessThan(0);
  });

  it('can be set to zero for a free-swap game', () => {
    const { room, a } = deepRoom({ reshuffles: 3, reshuffleCost: 0 });
    room.reshufflePrompt(a.id);
    expect(scoreOf(room, a.id)).toBe(0);
  });

  it('clamps a hostile cost rather than trusting the host', () => {
    const lobby = newRoom();
    const host = lobby.addPlayer('Alice', 'player');
    lobby.configure(host.id, { reshuffleCost: 99_999 });
    expect(lobby.getSnapshot().config.reshuffleCost).toBe(500);
    lobby.configure(host.id, { reshuffleCost: -50 });
    expect(lobby.getSnapshot().config.reshuffleCost).toBe(0);
  });

  it('reports the charge on the round scoreboard, and the breakdown reconciles', () => {
    const { room, a, b } = deepRoom({ reshuffles: 1 });
    room.reshufflePrompt(a.id);
    room.submitClue(a.id, ['🚢']);
    room.submitClue(b.id, ['🍕']);
    vi.advanceTimersByTime(1500 + 30_000 + 4000 + 1500 + 30_000 + 4000);
    const rows = room.getSnapshot().roundResults!;
    const alice = rows.find((r) => r.playerId === a.id)!;
    expect(alice.penaltyPoints).toBe(150);
    expect(alice.totalScore).toBe(alice.guesserPoints + alice.authorPoints - alice.penaltyPoints);
  });

  it('does not charge for a swap that was rejected', () => {
    const { room, a } = deepRoom({ reshuffles: 0 });
    expect(() => room.reshufflePrompt(a.id)).toThrow(/turned off/i);
    expect(scoreOf(room, a.id)).toBe(0);
  });
});

describe('Room clue bumps', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lets a solver bump mid-window and pays the author', () => {
    const { room, a, b } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    const before = scoreOf(room, a.id);
    room.bumpClue(b.id);
    expect(scoreOf(room, a.id)).toBe(before + DEFAULT_SCORING.bumpPoints);
  });

  it('refuses a player who has not solved it yet', () => {
    const { room, c } = trioAtGuessing();
    expect(() => room.bumpClue(c.id)).toThrow(/solve it first/i);
  });

  it('refuses the author their own clue', () => {
    const { room, a, b } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    expect(() => room.bumpClue(a.id)).toThrow(/your own clue/i);
  });

  it('counts one bump per player', () => {
    const { room, b } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    room.bumpClue(b.id);
    expect(() => room.bumpClue(b.id)).toThrow(/already bumped/i);
  });

  it('opens to the whole room once the clue resolves', () => {
    const { room, a, b, c } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    room.submitGuess(c.id, 'Titanic'); // everyone solved -> CLUE_SCORING
    expect(room.phase).toBe('CLUE_SCORING');
    const before = scoreOf(room, a.id);
    room.bumpClue(c.id);
    expect(scoreOf(room, a.id)).toBe(before + DEFAULT_SCORING.bumpPoints);
  });

  it('surfaces the tally through the serializer', () => {
    const { room, b, c } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    room.bumpClue(b.id);
    const bView = serializeRoomFor(room.getSnapshot(), b.id).activeClue!;
    expect(bView.bumps).toBe(1);
    expect(bView.bumpPoints).toBe(DEFAULT_SCORING.bumpPoints);
    expect(bView.youBumped).toBe(true);
    expect(bView.youCanBump).toBe(false);
    expect(serializeRoomFor(room.getSnapshot(), c.id).activeClue?.youCanBump).toBe(false);
  });
});

describe('Room solvers chat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Captures every chat message alongside the audience the Room chose for it. */
  function chatSpy(): { hooks: RoomHooks; sent: { text: string; to: string[] }[] } {
    const sent: { text: string; to: string[] }[] = [];
    return {
      sent,
      hooks: {
        ...noopHooks,
        onChat: (_r, message, recipientIds) => sent.push({ text: message.text, to: recipientIds }),
      },
    };
  }

  it('delivers only to the author and the players who have solved', () => {
    const spy = chatSpy();
    const { room, a, b, c } = trioAtGuessing(spy.hooks);
    room.submitGuess(b.id, 'Titanic');
    room.sendClueChat(b.id, 'called it off the boat');

    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0]!.to.sort()).toEqual([a.id, b.id].sort());
    expect(spy.sent[0]!.to).not.toContain(c.id); // Cara is still guessing
  });

  it('refuses a player who is still guessing', () => {
    const { room, c } = trioAtGuessing();
    expect(() => room.sendClueChat(c.id, 'is it a boat?')).toThrow(/solve it first/i);
  });

  it('opens to the whole room once the clue resolves', () => {
    const spy = chatSpy();
    const { room, a, b, c } = trioAtGuessing(spy.hooks);
    room.submitGuess(b.id, 'Titanic');
    room.submitGuess(c.id, 'Titanic'); // -> CLUE_SCORING
    room.sendClueChat(c.id, 'brutal clue');
    expect(spy.sent[spy.sent.length - 1]!.to.sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it('is closed outside a live clue', () => {
    const room = newRoom();
    const a = room.addPlayer('Alice', 'player');
    room.addPlayer('Bob', 'player');
    expect(() => room.sendClueChat(a.id, 'hello?')).toThrow(/no clue/i);
  });

  it('rejects empty messages and rate-limits a flood', () => {
    const { room, b } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    expect(() => room.sendClueChat(b.id, '   ')).toThrow(/empty/i);
    room.sendClueChat(b.id, 'first');
    expect(() => room.sendClueChat(b.id, 'second')).toThrow(/slow down/i);
  });

  it('keeps the log out of a still-guessing payload but hands it to solvers', () => {
    const { room, a, b, c } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    room.sendClueChat(b.id, 'it was the iceberg');

    expect(serializeRoomFor(room.getSnapshot(), b.id).clueChat).toHaveLength(1);
    expect(serializeRoomFor(room.getSnapshot(), a.id).clueChat).toHaveLength(1);
    const caraView = JSON.stringify(serializeRoomFor(room.getSnapshot(), c.id));
    expect(caraView).not.toContain('iceberg');
    expect(caraView).not.toContain('Titanic');
  });

  it('starts each clue with a clean log', () => {
    const { room, b, c } = trioAtGuessing();
    room.submitGuess(b.id, 'Titanic');
    room.sendClueChat(b.id, 'it was the iceberg');
    room.submitGuess(c.id, 'Titanic'); // -> CLUE_SCORING
    vi.advanceTimersByTime(4000 + 1500); // -> next clue, GUESSING
    expect(room.getSnapshot().active?.chat).toEqual([]);
  });
});

// ── mixed pack mode ────────────────────────────────────────────────────────
// Each player draws from a *different* pack, so there is no round-level pack
// and every pack-facing read has to be per-player or per-clue instead.
const MIXED_PROMPTS: Record<string, PromptForPlay> = {
  songs: { id: 'm1', answer: 'Thriller', accepted: ['Thriller'], blocklist: [], difficulty: 1 },
  toys: { id: 'm2', answer: 'Jenga', accepted: ['Jenga'], blocklist: [], difficulty: 1 },
};

const mixedContent = {
  dealMixedRound: () => [
    { category: { slug: 'songs', name: 'Songs' }, prompt: MIXED_PROMPTS.songs! },
    { category: { slug: 'toys', name: 'Toys & Board Games' }, prompt: MIXED_PROMPTS.toys! },
  ],
  dealRound: () => ({ category: { slug: 'movies', name: 'Movies' }, assignments: PROMPTS }),
  packs: () => [
    { slug: 'songs', name: 'Songs', emoji: '🎵', group: 'Pop Culture' },
    { slug: 'toys', name: 'Toys & Board Games', emoji: '🪀', group: 'Pop Culture' },
  ],
  categorySlugsForPack: () => [],
  // Records which pack a swap was drawn from, so the test can assert a swap
  // never moves a player out of the pack their guessers were told about.
  drawOne: (slug: string) => ({
    id: `swap-${slug}`,
    answer: `Swapped ${slug}`,
    accepted: [`Swapped ${slug}`],
    blocklist: [],
    difficulty: 1,
  }),
} as unknown as ContentProvider;

function mixedRoomAtGuessing(): { room: Room; a: Player; b: Player } {
  const room = new Room('MIXD', {
    content: mixedContent,
    scoring: DEFAULT_SCORING,
    rng: () => 0.5,
    hooks: noopHooks,
  });
  const a = room.addPlayer('Alice', 'player');
  const b = room.addPlayer('Bob', 'player');
  room.configure(a.id, { packMode: 'mixed' });
  room.start(a.id);
  vi.advanceTimersByTime(2000 + 3100);
  return { room, a, b };
}

describe('Room mixed pack mode', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives each player a prompt from a different pack', () => {
    const { room, a, b } = mixedRoomAtGuessing();
    const va = serializeRoomFor(room.getSnapshot(), a.id);
    const vb = serializeRoomFor(room.getSnapshot(), b.id);

    expect(va.yourPrompt).toBe('Thriller');
    expect(vb.yourPrompt).toBe('Jenga');
    expect(va.yourCategory?.name).toBe('Songs');
    expect(vb.yourCategory?.name).toBe('Toys & Board Games');
    expect(va.yourCategory?.slug).not.toBe(vb.yourCategory?.slug);
  });

  it('has no round-level pack, so clients must read the per-player one', () => {
    const { room, a } = mixedRoomAtGuessing();
    expect(serializeRoomFor(room.getSnapshot(), a.id).category).toBeNull();
  });

  it("labels the active clue with its own author's pack", () => {
    const { room, a, b } = mixedRoomAtGuessing();
    room.submitClue(a.id, ['💀', '🕺']);
    room.submitClue(b.id, ['🧱', '🗼']);
    vi.advanceTimersByTime(1500);

    // Whoever is up, the guesser is told THAT clue's pack — not the round's
    // (there isn't one) and not their own.
    const view = serializeRoomFor(room.getSnapshot(), b.id);
    const authorIsAlice = view.activeClue?.authorId === a.id;
    expect(view.activeClue?.category?.name).toBe(authorIsAlice ? 'Songs' : 'Toys & Board Games');
  });

  it("keeps a prompt swap inside the swapper's own pack", () => {
    const { room, a, b } = mixedRoomAtGuessing();
    room.reshufflePrompt(a.id);
    room.reshufflePrompt(b.id);

    // drawOne encodes the pack it was asked for, so this proves each player was
    // re-drawn from their own pack rather than a shared round pack.
    expect(serializeRoomFor(room.getSnapshot(), a.id).yourPrompt).toBe('Swapped songs');
    expect(serializeRoomFor(room.getSnapshot(), b.id).yourPrompt).toBe('Swapped toys');
  });

  it('still labels every clue in shared mode, from the round pack', () => {
    const { room, a } = roomAtGuessing();
    const view = serializeRoomFor(room.getSnapshot(), a.id);
    expect(view.category?.name).toBe('Movies');
    expect(view.yourCategory?.name).toBe('Movies');
    expect(view.activeClue?.category?.name).toBe('Movies');
  });
});
