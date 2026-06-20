/**
 * Role-filtered serializer (design doc §4/§7 + Appendix B). THE backbone of
 * anti-cheat: it guarantees secret data (your own prompt, a clue's answer
 * before it resolves) is physically absent from payloads sent to clients that
 * aren't entitled to it. Pure function over a snapshot so it can be unit-tested
 * in isolation ("assert non-author payloads never contain the answer").
 */
import type { RoomView } from '@moji/shared';
import type { RoomSnapshot } from '../rooms/Room.js';

export function serializeRoomFor(snap: RoomSnapshot, recipientId: string): RoomView {
  const youAreAuthor = snap.active?.authorId === recipientId;

  // The active clue's answer is revealed only once the clue resolves
  // (CLUE_SCORING) or to its own author. Never to other players mid-guess.
  let activeAnswer: string | null = null;
  if (snap.active) {
    if (snap.phase === 'CLUE_SCORING' || youAreAuthor) activeAnswer = snap.active.answer;
  }

  return {
    code: snap.code,
    phase: snap.phase,
    version: snap.version,
    deadlineTs: snap.deadlineTs,
    config: snap.config,
    packs: snap.packs,
    players: snap.players,
    hostId: snap.hostId,
    roundNumber: snap.roundNumber,
    category: snap.category,

    // Secret: only the recipient's own prompt is ever included.
    yourPrompt: snap.assignments.get(recipientId) ?? null,
    youSubmitted: snap.submittedAuthorIds.has(recipientId),

    activeClue: snap.active
      ? {
          authorId: snap.active.authorId,
          authorName: snap.active.authorName,
          authorAvatar: snap.active.authorAvatar,
          emojis: snap.active.emojis,
          answer: activeAnswer,
          solvedCount: snap.active.solvedCount,
          eligibleCount: snap.active.eligibleCount,
          youAreAuthor,
          solves: snap.active.solves,
          // Author earnings shown once the clue resolves.
          authorPoints: snap.phase === 'CLUE_SCORING' ? snap.active.authorPoints : null,
          yourSolve: snap.active.solves.find((s) => s.playerId === recipientId) ?? null,
        }
      : null,
    guessFeed: snap.guessFeed,
    roundResults: snap.roundResults,
    gameResults: snap.gameResults,
  };
}
