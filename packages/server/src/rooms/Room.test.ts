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
    expect(scoreOf(room, a.id)).toBe(130); // author: 1 solver * authorPerSolve
    expect(room.phase).toBe('CLUE_SCORING'); // all eligible solved -> ends early

    // answer is revealed to everyone during scoring, with the reveal payload
    const reveal = serializeRoomFor(room.getSnapshot(), b.id).activeClue!;
    expect(reveal.answer).toBe('Titanic');
    expect(reveal.authorPoints).toBe(130);
    expect(reveal.solves).toHaveLength(1);
    expect(reveal.yourSolve).toMatchObject({ rank: 1, points: 1000 });

    // advance through scoring -> Bob's clue plays next
    vi.advanceTimersByTime(4000);
    expect(room.phase).toBe('CLUE_REVEAL');
    vi.advanceTimersByTime(1500);
    expect(room.phase).toBe('GUESSING');

    room.submitGuess(a.id, 'pizza');
    // Alice: 1000 (solving Bob) + 130 (author of her own solved clue) = 1130
    expect(scoreOf(room, a.id)).toBe(1130);
    expect(room.phase).toBe('CLUE_SCORING');

    vi.advanceTimersByTime(4000);
    expect(room.phase).toBe('ROUND_RESULTS');
    expect(room.getSnapshot().roundResults).not.toBeNull();

    vi.advanceTimersByTime(10000);
    expect(room.phase).toBe('GAME_RESULTS');
    const results = room.getSnapshot().gameResults!;
    expect(results).toHaveLength(2);
    // Both: 1000 (guesser) + 130 (author) = 1130
    expect(results.every((r) => r.totalScore === 1130)).toBe(true);
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
function deepRoom(config: { reshuffles?: number } = {}): { room: Room; a: Player; b: Player } {
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
      hooks: { onStateChange() {}, onGuess: (_r, g) => guesses.push(g), onClosed() {} },
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

  it('pushes each letter as it lands, and stops at 75%', () => {
    const hints: string[] = [];
    const { room, b } = roomAtGuessing({
      onStateChange: () => {},
      onGuess: () => {},
      onHint: (_r, hint) => hints.push(hint),
      onClosed: () => {},
    });

    vi.advanceTimersByTime(30_000); // the whole guess window

    // 7 letters -> floor(7 * 0.75) = 5 reveals, one event each
    expect(hints).toHaveLength(5);
    expect(hints[0]!.replace(/[^_]/g, '')).toHaveLength(6); // one letter shown
    const last = hints[hints.length - 1]!;
    expect(last.replace(/[^_]/g, '')).toHaveLength(2); // two still hidden
    expect(last).not.toBe('Titanic');
    // every step reveals exactly one more letter than the one before it
    const shown = hints.map((h) => 7 - h.replace(/[^_]/g, '').length);
    expect(shown).toEqual([1, 2, 3, 4, 5]);
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
      onClosed: () => {},
    });
    vi.advanceTimersByTime(6_000); // one letter has dropped
    expect(hints).toHaveLength(1);
    room.submitGuess(b.id, 'Titanic'); // everyone solved -> CLUE_SCORING
    vi.advanceTimersByTime(30_000);

    // Titanic had four ticks still pending; none of them fire. The only later
    // hints belong to the next clue ("Pizza" -> 5 letters -> 3 reveals).
    expect(hints.filter((h) => h.length === 'Titanic'.length)).toHaveLength(1);
    expect(hints.filter((h) => h.length === 'Pizza'.length)).toHaveLength(3);
  });
});
