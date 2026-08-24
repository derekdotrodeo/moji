import type { ScoreRow } from '@moji/shared';
import { Avatar, cn } from '../ui.js';

const rankColor = (rank: number) =>
  rank === 1 ? 'text-gold' : rank === 2 ? 'text-text-3' : rank === 3 ? 'text-pink-light' : 'text-muted';

/** Ranked player rows, reused by the Leaderboard and the Winner final standings. */
export function Standings({
  rows,
  myId,
  showDelta = false,
}: {
  rows: ScoreRow[];
  myId: string | null;
  showDelta?: boolean;
}) {
  return (
    <ol className="space-y-2">
      {rows.map((r) => {
        const isYou = r.playerId === myId;
        // Prompt swaps are charged against the round, so the delta has to
        // net them out or it won't match the score beside it.
        const delta = r.guesserPoints + r.authorPoints - r.penaltyPoints;
        return (
          <li
            key={r.playerId}
            className={cn(
              'flex items-center gap-3 rounded-tile border-2 px-3 py-2.5',
              isYou ? 'border-gold bg-gold/10' : 'border-transparent bg-panel2',
            )}
          >
            <span className={cn('w-6 text-center font-display text-xl font-extrabold', rankColor(r.rank))}>
              {r.rank}
            </span>
            <Avatar emoji={r.avatar} id={r.playerId} className="h-9 w-9 text-lg" />
            <span className="flex-1 truncate font-display font-extrabold">
              {r.displayName}
              {isYou && <span className="ml-1 text-xs text-muted">(you)</span>}
            </span>
            {showDelta && delta !== 0 && (
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 font-mono text-xs font-bold',
                  delta > 0 ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral',
                )}
              >
                {delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}
              </span>
            )}
            <span className="font-mono text-lg text-gold">{r.totalScore.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}
