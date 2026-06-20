import { useEffect, useState } from 'react';
import type { RoomView } from '@moji/shared';
import type { GameClient } from '../useGame.js';
import { Standings } from '../components/Standings.js';
import { Eyebrow, StickerButton } from '../ui.js';

export function Leaderboard({ game, view }: { game: GameClient; view: RoomView }) {
  const rows = view.roundResults ?? [];
  const me = view.players.find((p) => p.id === game.myId);
  const isHost = me?.isHost ?? false;
  const secs = useSecondsLeft(view.deadlineTs);
  const isFinalRound = view.roundNumber >= view.config.rounds;

  return (
    <div className="mx-auto max-w-3xl animate-moji-pop px-4 py-10">
      <div className="text-center">
        <Eyebrow className="text-gold">
          After round {view.roundNumber} of {view.config.rounds}
        </Eyebrow>
        <h1 className="mt-1 font-display text-4xl font-extrabold sm:text-5xl">Leaderboard 🏆</h1>
      </div>

      <div className="mt-8">
        <Standings rows={rows} myId={game.myId} showDelta />
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[2px] text-muted">
          <span className="h-2 w-2 animate-moji-pulse rounded-full bg-mint" />
          {isFinalRound ? 'Final results coming up' : 'Next round starts automatically'}
        </div>
        <StickerButton
          variant="cyan"
          size="lg"
          disabled={!isHost}
          onClick={() => isHost && game.next()}
        >
          {isFinalRound ? `Final results in ${secs}s 🏆` : `Round ${view.roundNumber + 1} in ${secs}s ▶`}
        </StickerButton>
        <p className="text-sm text-muted">
          {isHost ? 'no need to wait for everyone — tap to jump in now' : 'waiting for the host…'}
        </p>
      </div>
    </div>
  );
}

function useSecondsLeft(deadlineTs: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!deadlineTs) return 0;
  return Math.max(0, Math.ceil((deadlineTs - now) / 1000));
}
