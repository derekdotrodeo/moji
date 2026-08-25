/**
 * Public counters for the landing page.
 *
 * The number on the front page used to be a hardcoded 128,402. This replaces it
 * with a real one, which means it has two hard requirements a fake number
 * doesn't: it must never be the reason the page fails to render, and it must
 * never be wrong. Hence the in-process cache and the null-on-failure contract —
 * the client hides the line when it gets a null rather than showing a zero.
 */
import { sql } from 'drizzle-orm';
import type { PublicStats } from '@moji/shared';
import { db } from './db/client.js';
import { games } from './db/schema.js';

const EMPTY: PublicStats = {
  cluesGuessed: null,
  cluesGuessedThisWeek: null,
  gamesPlayed: null,
};

/** Long enough that the front page can't hammer Postgres; short enough to feel live. */
const CACHE_MS = 60_000;

let cached: { at: number; value: PublicStats } | null = null;

/** Test seam: drop the cache so a test can observe a fresh read. */
export function resetStatsCache(): void {
  cached = null;
}

async function query(): Promise<PublicStats> {
  const [row] = await db
    .select({
      cluesGuessed: sql<number>`coalesce(sum(${games.cluesGuessed}), 0)::int`,
      cluesGuessedThisWeek: sql<number>`coalesce(sum(${games.cluesGuessed}) filter (
        where ${games.endedAt} > now() - interval '7 days'
      ), 0)::int`,
      gamesPlayed: sql<number>`count(*)::int`,
    })
    .from(games)
    .where(sql`${games.status} = 'completed'`);

  return {
    cluesGuessed: row?.cluesGuessed ?? 0,
    cluesGuessedThisWeek: row?.cluesGuessedThisWeek ?? 0,
    gamesPlayed: row?.gamesPlayed ?? 0,
  };
}

/**
 * Cached public stats. Never throws: a database that is down, migrating, or
 * absent yields nulls, and the landing page simply omits the line.
 */
export async function weeklyStats(now: number = Date.now()): Promise<PublicStats> {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  try {
    const value = await query();
    cached = { at: now, value };
    return value;
  } catch (err) {
    console.warn('[stats] query failed:', (err as Error).message);
    // Cache the failure too, so an outage doesn't turn every page view into a
    // fresh connection attempt against a database that is already struggling.
    cached = { at: now, value: EMPTY };
    return EMPTY;
  }
}
