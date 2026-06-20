import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCORING, type Player, type PublicGuess } from '@moji/shared';
import { Room, type RoomHooks } from './Room.js';
import { serializeRoomFor } from '../realtime/serialize.js';
import type { ContentProvider, PromptForPlay } from '../content/ContentProvider.js';

const PROMPTS: PromptForPlay[] = [
  { id: 'p1', answer: 'Titanic', accepted: ['Titanic'], blocklist: [], difficulty: 1 },
  { id: 'p2', answer: 'Pizza', accepted: ['Pizza'], blocklist: [], difficulty: 1 },
];

// Deterministic content: A always gets Titanic, B always gets Pizza.
const fakeContent = {
  dealRound: () => ({ category: { slug: 'movies', name: 'Movies' }, assignments: PROMPTS }),
  packs: () => [{ slug: 'movies', name: 'Movies', emoji: '🎬' }],
  categorySlugsForPack: () => [],
} as unknown as ContentProvider;

const noopHooks: RoomHooks = {
  onStateChange: () => {},
  onGuess: () => {},
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
