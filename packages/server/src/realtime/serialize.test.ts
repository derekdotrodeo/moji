import { describe, expect, it } from 'vitest';
import type { GamePhase, Player } from '@moji/shared';
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

/** A snapshot mid-game: A authored "Titanic", B authored "Pizza", A's clue is live. */
function snapshot(phase: GamePhase): RoomSnapshot {
  return {
    code: 'ABCD',
    phase,
    version: 1,
    deadlineTs: null,
    config: { rounds: 3, clueCreationSeconds: 90, guessingSeconds: 40, packSlug: '' },
    packs: [],
    hostId: 'A',
    roundNumber: 1,
    category: { slug: 'movies', name: 'Movies' },
    players: [player('A'), player('B')],
    assignments: new Map([
      ['A', 'Titanic'],
      ['B', 'Pizza'],
    ]),
    submittedAuthorIds: new Set(['A', 'B']),
    reshuffledIds: new Set<string>(),
    active: {
      authorId: 'A',
      authorName: 'A',
      authorAvatar: '😎',
      emojis: ['🚢', '🧊'],
      answer: 'Titanic',
      solvedCount: 0,
      eligibleCount: 1,
      solves: [],
      authorPoints: null,
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

  it('reveals the answer to everyone once the clue resolves (CLUE_SCORING)', () => {
    const snap = snapshot('CLUE_SCORING');
    expect(serializeRoomFor(snap, 'B').activeClue?.answer).toBe('Titanic');
  });

  it('exposes the public clue emojis to guessers', () => {
    const snap = snapshot('GUESSING');
    expect(serializeRoomFor(snap, 'B').activeClue?.emojis).toEqual(['🚢', '🧊']);
  });
});
