/**
 * Best-effort persistence of completed games (design doc §5). Live play never
 * touches Postgres; we write a durable record only when a game finishes. A DB
 * outage must not break gameplay, so callers treat this as fire-and-forget.
 */
import { db } from './db/client.js';
import { gamePlayers, games } from './db/schema.js';
import type { Room } from './rooms/Room.js';

export async function persistCompletedGame(room: Room): Promise<void> {
  const snap = room.getSnapshot();
  const results = snap.gameResults ?? [];

  const [game] = await db
    .insert(games)
    .values({
      roomCode: snap.code,
      config: snap.config,
      status: 'completed',
      endedAt: new Date(),
    })
    .returning();
  if (!game) return;

  for (const row of results) {
    await db.insert(gamePlayers).values({
      gameId: game.id,
      displayName: row.displayName,
      finalScore: row.totalScore,
      finalRank: row.rank,
    });
  }
}
