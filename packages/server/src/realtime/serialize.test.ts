import { describe, expect, it } from 'vitest';
import type { ChatMessage, ClueSolve, GamePhase, Player } from '@moji/shared';
import { serializeRoomFor } from './serialize.js';
import type { RoomSnapshot } from '../rooms/Room.js';

const player = (id: string): Player => ({
  id,
  displayName: id,
  avatar: '😎',
  isHost: id === 'A',
  role: 'player',
  connection: 'CONNECTED',
  ready: false,
  score: 0,
  joinedAt: 0,
});

const solve = (playerId: string): ClueSolve => ({
  playerId,
  displayName: playerId,
  avatar: '😎',
  rank: 1,
  ms: 5_000,
  points: 800,
});

const CHAT_TEXT = 'called it, Titanic from the first emoji';

const chat = (playerId: string): ChatMessage => ({
  id: 'm1',
  playerId,
  playerName: playerId,
  avatar: '😎',
  text: CHAT_TEXT,
  at: 0,
});

interface SnapOpts {
  solves?: ClueSolve[];
  chat?: ChatMessage[];
  bumps?: Set<string>;
}

/**
 * A snapshot mid-game: A authored "Titanic", B authored "Pizza", C is along for
 * the ride, and A's clue is live.
 */
function snapshot(phase: GamePhase, opts: SnapOpts = {}): RoomSnapshot {
  return {
    code: 'ABCD',
    phase,
    version: 1,
    deadlineTs: null,
    config: {
      rounds: 3,
      clueCreationSeconds: 90,
      guessingSeconds: 40,
      packSlug: '',
      reshuffles: 3,
      reshuffleCost: 150,
    },
    packs: [],
    hostId: 'A',
    roundNumber: 1,
    category: { slug: 'movies', name: 'Movies' },
    players: [player('A'), player('B'), player('C')],
    assignments: new Map([
      ['A', 'Titanic'],
      ['B', 'Pizza'],
    ]),
    submittedAuthorIds: new Set(['A', 'B']),
    reshufflesUsed: new Map<string, number>(),
    active: {
      authorId: 'A',
      authorName: 'A',
      authorAvatar: '😎',
      emojis: ['🚢', '🧊'],
      answer: 'Titanic',
      solvedCount: opts.solves?.length ?? 0,
      eligibleCount: 2,
      solves: opts.solves ?? [],
      authorPoints: null,
      bumps: opts.bumps ?? new Set<string>(),
      bumpPoints: 0,
      chat: opts.chat ?? [],
      hint: null,
    },
    guessFeed: [],
    roundResults: null,
    gameResults: null,
  };
}

describe('serializeRoomFor — secret prompt isolation', () => {
  it('gives each player only their own prompt', () => {
    const snap = snapshot('CLUE_CREATION');
    expect(serializeRoomFor(snap, 'A').yourPrompt).toBe('Titanic');
    expect(serializeRoomFor(snap, 'B').yourPrompt).toBe('Pizza');
  });

  it("never includes another player's prompt anywhere in the payload", () => {
    const snap = snapshot('CLUE_CREATION');
    const bView = JSON.stringify(serializeRoomFor(snap, 'B'));
    expect(bView).not.toContain('Titanic'); // A's secret prompt
  });
});

describe('serializeRoomFor — active clue answer leakage (anti-cheat)', () => {
  it('hides the answer from a non-author during GUESSING', () => {
    const snap = snapshot('GUESSING');
    const view = serializeRoomFor(snap, 'B');
    expect(view.activeClue?.answer).toBeNull();
    expect(view.activeClue?.youAreAuthor).toBe(false);
    expect(JSON.stringify(view)).not.toContain('Titanic');
  });

  it('shows the answer to the clue author during GUESSING', () => {
    const snap = snapshot('GUESSING');
    const view = serializeRoomFor(snap, 'A');
    expect(view.activeClue?.answer).toBe('Titanic');
    expect(view.activeClue?.youAreAuthor).toBe(true);
  });

  it('shows the answer to a player who has already solved it', () => {
    // They typed it to get here; withholding it only stops us showing them
    // what they won. Everyone still guessing is unaffected.
    const snap = snapshot('GUESSING', { solves: [solve('B')] });
    expect(serializeRoomFor(snap, 'B').activeClue?.answer).toBe('Titanic');
    expect(serializeRoomFor(snap, 'C').activeClue?.answer).toBeNull();
  });

  it('reveals the answer to everyone once the clue resolves (CLUE_SCORING)', () => {
    const snap = snapshot('CLUE_SCORING');
    expect(serializeRoomFor(snap, 'B').activeClue?.answer).toBe('Titanic');
  });

  it('exposes the public clue emojis to guessers', () => {
    const snap = snapshot('GUESSING');
    expect(serializeRoomFor(snap, 'B').activeClue?.emojis).toEqual(['🚢', '🧊']);
  });
});

describe('serializeRoomFor — solvers chat (anti-cheat)', () => {
  it('withholds the chat from a player who is still guessing', () => {
    const snap = snapshot('GUESSING', { solves: [solve('B')], chat: [chat('B')] });
    const view = serializeRoomFor(snap, 'C');
    expect(view.clueChat).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(CHAT_TEXT);
    expect(JSON.stringify(view)).not.toContain('Titanic');
  });

  it('gives the chat to solvers and to the author', () => {
    const snap = snapshot('GUESSING', { solves: [solve('B')], chat: [chat('B')] });
    expect(serializeRoomFor(snap, 'B').clueChat).toHaveLength(1);
    expect(serializeRoomFor(snap, 'A').clueChat).toHaveLength(1);
  });

  it('opens the whole log to the room once the clue resolves', () => {
    const snap = snapshot('CLUE_SCORING', { solves: [solve('B')], chat: [chat('B')] });
    expect(serializeRoomFor(snap, 'C').clueChat).toHaveLength(1);
  });

  it('travels with the answer, never apart from it', () => {
    // The invariant that keeps the two rules from drifting: chat is visible in
    // exactly the payloads the answer is, so a leak needs both to break.
    for (const phase of ['CLUE_REVEAL', 'GUESSING', 'CLUE_SCORING'] as GamePhase[]) {
      const snap = snapshot(phase, { solves: [solve('B')], chat: [chat('B')] });
      for (const id of ['A', 'B', 'C']) {
        const view = serializeRoomFor(snap, id);
        const knowsAnswer = view.activeClue?.answer !== null;
        expect(view.clueChat.length > 0, `${phase}/${id}`).toBe(knowsAnswer);
      }
    }
  });
});

describe('serializeRoomFor — bumps', () => {
  it('lets a solver bump but not a player who is still guessing', () => {
    const snap = snapshot('GUESSING', { solves: [solve('B')] });
    expect(serializeRoomFor(snap, 'B').activeClue?.youCanBump).toBe(true);
    expect(serializeRoomFor(snap, 'C').activeClue?.youCanBump).toBe(false);
  });

  it('never lets the author bump their own clue', () => {
    const snap = snapshot('CLUE_SCORING');
    expect(serializeRoomFor(snap, 'A').activeClue?.youCanBump).toBe(false);
  });

  it('opens bumping to the whole room once the clue resolves', () => {
    const snap = snapshot('CLUE_SCORING');
    expect(serializeRoomFor(snap, 'C').activeClue?.youCanBump).toBe(true);
  });

  it('reports who has already bumped, and stops them bumping twice', () => {
    const snap = snapshot('CLUE_SCORING', { bumps: new Set(['B']) });
    const bView = serializeRoomFor(snap, 'B');
    expect(bView.activeClue?.youBumped).toBe(true);
    expect(bView.activeClue?.youCanBump).toBe(false);
    expect(bView.activeClue?.bumps).toBe(1);
    expect(serializeRoomFor(snap, 'C').activeClue?.youBumped).toBe(false);
  });

  it('does not offer a spectator a button the server would refuse', () => {
    const snap = snapshot('CLUE_SCORING');
    snap.players = snap.players.map((p) => (p.id === 'C' ? { ...p, role: 'spectator' } : p));
    expect(serializeRoomFor(snap, 'C').activeClue?.youCanBump).toBe(false);
  });
});

describe('serializeRoomFor — prompt swaps', () => {
  it('counts down the swaps a player has left', () => {
    const snap = snapshot('CLUE_CREATION');
    snap.reshufflesUsed.set('B', 2);
    expect(serializeRoomFor(snap, 'B').yourReshufflesLeft).toBe(1);
    expect(serializeRoomFor(snap, 'A').yourReshufflesLeft).toBe(3);
  });

  it('stops offering a swap once they are spent', () => {
    const snap = snapshot('CLUE_CREATION');
    snap.reshufflesUsed.set('B', 3);
    snap.submittedAuthorIds = new Set();
    expect(serializeRoomFor(snap, 'B').youCanReshuffle).toBe(false);
  });
});
