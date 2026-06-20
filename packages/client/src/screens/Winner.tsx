import { useState } from 'react';
import type { ScoreRow, RoomView } from '@moji/shared';
import type { GameClient } from '../useGame.js';
import { Confetti } from '../components/Confetti.js';
import { Standings } from '../components/Standings.js';
import { Avatar, Eyebrow, Panel, StickerButton, cn } from '../ui.js';

export function Winner({
  game,
  view,
  onLeave,
}: {
  game: GameClient;
  view: RoomView;
  onLeave: () => void;
}) {
  const rows = view.gameResults ?? [];
  const me = view.players.find((p) => p.id === game.myId);
  const isHost = me?.isHost ?? false;
  const winner = rows[0];
  const youWon = winner?.playerId === game.myId;

  const byRank = (r: number) => rows.find((x) => x.rank === r);

  return (
    <div className="relative mx-auto max-w-5xl px-4 py-10">
      <Confetti />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Celebration + podium */}
        <div className="animate-moji-pop text-center">
          <Eyebrow className="text-gold">👑 Winner Winner</Eyebrow>
          <h1 className="mt-1 font-display text-4xl font-extrabold sm:text-5xl">
            {youWon ? 'You took the crown!' : `${winner?.displayName ?? '—'} wins!`}
          </h1>

          <div className="mt-10 flex items-end justify-center gap-3">
            <Plinth row={byRank(2)} place={2} heightClass="h-24" bg="bg-hairline2" />
            <Plinth row={byRank(1)} place={1} heightClass="h-36" bg="bg-gold" crown />
            <Plinth row={byRank(3)} place={3} heightClass="h-16" bg="bg-hairline3" />
          </div>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <StickerButton variant="lime" size="lg" disabled={!isHost} onClick={() => isHost && game.start()}>
              Rematch 🔁
            </StickerButton>
            <ShareButton code={view.code} />
          </div>
          <button onClick={onLeave} className="mt-4 text-sm text-muted hover:text-paper">
            ← leave to home
          </button>
          {!isHost && <p className="mt-2 text-sm text-muted">waiting for the host to rematch…</p>}
        </div>

        {/* Final standings */}
        <aside>
          <Eyebrow className="mb-3">Final Standings</Eyebrow>
          <Standings rows={rows} myId={game.myId} />
          <Panel className="mt-4 p-3 text-center text-sm text-muted">
            🔗 Share your win — invite the squad for a rematch
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Plinth({
  row,
  place,
  heightClass,
  bg,
  crown,
}: {
  row?: ScoreRow;
  place: number;
  heightClass: string;
  bg: string;
  crown?: boolean;
}) {
  if (!row) return <div className="w-24" />;
  return (
    <div className="flex w-24 flex-col items-center">
      <div className="relative">
        {crown && <div className="absolute -top-7 left-1/2 -translate-x-1/2 animate-moji-float text-3xl">👑</div>}
        <Avatar emoji={row.avatar} id={row.playerId} className="h-14 w-14 text-2xl" />
      </div>
      <div className="mt-1 max-w-full truncate text-sm font-extrabold">{row.displayName}</div>
      <div className="font-mono text-sm text-gold">{row.totalScore.toLocaleString()}</div>
      <div
        className={cn(
          'mt-2 flex w-full items-start justify-center rounded-t-tile border-[2.5px] border-outline pt-2 font-display text-2xl font-extrabold text-outline shadow-sticker-sm',
          bg,
          heightClass,
        )}
      >
        {place}
      </div>
    </div>
  );
}

function ShareButton({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/r/${code}`;
    const text = `I just played Moji 🤔 — join my room ${code}!`;
    try {
      if (navigator.share) await navigator.share({ title: 'Moji', text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* user cancelled or blocked; ignore */
    }
  };
  return (
    <StickerButton variant="cyan" size="lg" onClick={share}>
      {done ? 'Copied! ✓' : '📤 Share'}
    </StickerButton>
  );
}
