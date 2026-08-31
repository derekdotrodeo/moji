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

  // Solvers get the answer too, and with it the solvers' side channel. Deriving
  // both from one flag is the point: chat is written by people who know the
  // answer and routinely contains it, so it can never be visible to anyone the
  // answer isn't. Adding a way to see chat means adding a way to see `answer`.
  const youSolved = !!snap.active?.solves.some((s) => s.playerId === recipientId);
  if (snap.active && youSolved) activeAnswer = snap.active.answer;
  const youKnowAnswer = activeAnswer !== null;
  // Mirrors Room.bumpClue's guards exactly, so the button is never offered to
  // someone the server would turn away.
  const youArePlayer = snap.players.find((p) => p.id === recipientId)?.role === 'player';

  const reshufflesLeft = Math.max(
    0,
    snap.config.reshuffles - (snap.reshufflesUsed.get(recipientId) ?? 0),
  );

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
    // A pack name is a hint, never a secret — it narrows to a pack's worth of
    // titles and no further, which is exactly what it is for. Sent per-recipient
    // only because in 'mixed' mode each player's pack differs; there is nothing
    // here another player couldn't be told.
    yourCategory: snap.assignmentCategories.get(recipientId) ?? null,

    // Secret: only the recipient's own prompt is ever included.
    yourPrompt: snap.assignments.get(recipientId) ?? null,
    youSubmitted: snap.submittedAuthorIds.has(recipientId),
    yourReshufflesLeft: reshufflesLeft,
    youCanReshuffle:
      snap.phase === 'CLUE_CREATION' &&
      snap.assignments.has(recipientId) &&
      !snap.submittedAuthorIds.has(recipientId) &&
      reshufflesLeft > 0,

    activeClue: snap.active
      ? {
          authorId: snap.active.authorId,
          authorName: snap.active.authorName,
          authorAvatar: snap.active.authorAvatar,
          emojis: snap.active.emojis,
          // Public in both modes: this is the guesser's free hint, and it must
          // be per-clue rather than per-round or it goes wrong under 'mixed'.
          category: snap.active.category,
          answer: activeAnswer,
          hint: snap.active.hint,
          solvedCount: snap.active.solvedCount,
          eligibleCount: snap.active.eligibleCount,
          youAreAuthor,
          solves: snap.active.solves,
          // Author earnings shown once the clue resolves.
          authorPoints: snap.phase === 'CLUE_SCORING' ? snap.active.authorPoints : null,
          bumps: snap.active.bumps.size,
          bumpPoints: snap.active.bumpPoints,
          youBumped: snap.active.bumps.has(recipientId),
          youCanBump:
            youKnowAnswer &&
            youArePlayer &&
            !youAreAuthor &&
            !snap.active.bumps.has(recipientId),
          yourSolve: snap.active.solves.find((s) => s.playerId === recipientId) ?? null,
        }
      : null,
    guessFeed: snap.guessFeed,
    clueChat: youKnowAnswer && snap.active ? snap.active.chat : [],
    roundResults: snap.roundResults,
    gameResults: snap.gameResults,
  };
}
