import { useState } from 'react';
import type { PublicGuess, RoomView } from '@moji/shared';
import type { GameClient } from '../useGame.js';
import { TimerRing } from '../components/TimerRing.js';
import { Avatar, Eyebrow, StickerButton, cn } from '../ui.js';

export function GuessScreen({ game, view }: { game: GameClient; view: RoomView }) {
  const clue = view.activeClue;
  if (!clue) return null;
  const guessing = view.phase === 'GUESSING';
  const me = view.players.find((p) => p.id === game.myId);
  const totalMs = view.config.guessingSeconds * 1000;
  // Only run the ring during GUESSING; during the CLUE_REVEAL beat the phase
  // deadline is the (short) reveal timer, which would flash a stale countdown.
  const ringDeadline = guessing ? view.deadlineTs : null;
  const avatarOf = (id: string) => view.players.find((p) => p.id === id)?.avatar ?? '❓';

  return (
    <div className="mx-auto h-screen max-w-7xl gap-4 px-4 py-4 lg:grid lg:grid-cols-[236px_1fr_372px]">
      {/* Live scores rail (desktop) */}
      <aside className="hidden self-start lg:block">
        <Eyebrow className="mb-2">Live Scores</Eyebrow>
        <ScoresRail view={view} myId={game.myId} />
      </aside>

      {/* Center: the clue hero */}
      <main className="flex flex-col items-center justify-center text-center">
        {/* Mobile header */}
        <div className="mb-4 flex w-full items-center justify-between lg:hidden">
          <Eyebrow className="text-pink">
            {clue.authorAvatar} {clue.authorName}'s clue
          </Eyebrow>
          <div className="flex items-center gap-3">
            <ScorePill score={me?.score ?? 0} />
            <TimerRing deadlineTs={ringDeadline} totalMs={totalMs} size={48}>
              {!guessing ? <span className="text-xs">🤫</span> : undefined}
            </TimerRing>
          </div>
        </div>

        <Eyebrow className="mb-5 hidden text-pink lg:block">
          {clue.authorAvatar} {clue.authorName}'s clue · name the {view.category?.name}
        </Eyebrow>

        <div className="flex max-w-3xl animate-moji-pop flex-wrap items-center justify-center gap-2 sm:gap-3">
          {clue.emojis.map((e, i) => (
            <span
              key={i}
              className="flex h-14 w-14 items-center justify-center rounded-tile border-[2.5px] border-outline bg-paper text-3xl shadow-sticker sm:h-20 sm:w-20 sm:text-5xl"
            >
              {e}
            </span>
          ))}
        </div>

        {clue.youAreAuthor ? (
          <p className="mt-8 text-muted">
            This is your clue — sit back and watch the chaos 🍿
            <br />
            <span className="text-muted-3">(answer: {clue.answer})</span>
          </p>
        ) : !guessing ? (
          <p className="mt-8 animate-moji-pulse font-display text-xl font-extrabold text-cyan">
            get ready…
          </p>
        ) : null}
      </main>

      {/* Right panel: timer + score + feed + input */}
      <section className="mt-4 flex min-h-0 flex-col lg:mt-0">
        <div className="mb-3 hidden items-center justify-between lg:flex">
          <div>
            <Eyebrow>
              Round {view.roundNumber}/{view.config.rounds}
            </Eyebrow>
            <ScorePill score={me?.score ?? 0} />
          </div>
          <TimerRing deadlineTs={ringDeadline} totalMs={totalMs} size={88} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-card border border-hairline2 bg-panel">
          <GuessFeed feed={game.feed} myId={game.myId} avatarOf={avatarOf} />
          {!clue.youAreAuthor && (
            <GuessInput disabled={!guessing} onSubmit={(t) => game.submitGuess(t)} />
          )}
        </div>
      </section>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <div className="font-mono text-2xl font-bold text-gold">{score.toLocaleString()}</div>
  );
}

function ScoresRail({ view, myId }: { view: RoomView; myId: string | null }) {
  const ranked = [...view.players]
    .filter((p) => p.role === 'player')
    .sort((a, b) => b.score - a.score);
  return (
    <ol className="space-y-1.5">
      {ranked.map((p, i) => (
        <li
          key={p.id}
          className={cn(
            'flex items-center gap-2 rounded-tile px-2 py-1.5',
            p.id === myId ? 'border-2 border-gold bg-gold/10' : 'bg-panel2',
          )}
        >
          <span className="w-4 text-center font-mono text-sm text-muted">{i + 1}</span>
          <Avatar emoji={p.avatar} id={p.id} className="h-7 w-7 text-base" />
          <span className="flex-1 truncate text-sm font-semibold">{p.displayName}</span>
          <span className="font-mono text-sm text-gold">{p.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

function GuessFeed({
  feed,
  myId,
  avatarOf,
}: {
  feed: PublicGuess[];
  myId: string | null;
  avatarOf: (id: string) => string;
}) {
  const rows = [...feed].reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto p-3">
      {/* column-reverse keeps newest pinned to the bottom near the input */}
      {rows.length === 0 ? (
        <div className="py-8 text-center text-muted">be the first to guess… ⚡</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((g) => {
            const mine = g.guesserId === myId;
            return (
              <div
                key={g.id}
                className={cn(
                  'flex items-center gap-2 rounded-tile px-3 py-1.5 text-sm',
                  g.isCorrect ? 'bg-mint font-semibold text-outline' : 'bg-inset',
                )}
              >
                <span className="text-lg">{avatarOf(g.guesserId)}</span>
                <span className={cn('font-semibold', mine && !g.isCorrect && 'text-gold')}>
                  {g.guesserName}
                </span>
                {g.isCorrect ? (
                  <>
                    <span className="flex-1">guessed it!</span>
                    <span className="rounded-pill bg-outline px-2 py-0.5 font-mono text-xs text-mint">
                      +{g.points}
                    </span>
                  </>
                ) : (
                  <span className="flex-1 text-text-2">{g.text}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuessInput({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    onSubmit(t);
  };
  return (
    <div className="flex gap-2 border-t border-hairline2 p-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        disabled={disabled}
        placeholder={disabled ? 'get ready…' : 'type your guess…'}
        className="w-full rounded-tile border-2 border-hairline2 bg-inset px-4 py-2.5 outline-none focus:border-lime disabled:opacity-50"
        autoFocus
      />
      <StickerButton variant="lime" onClick={send} disabled={disabled} aria-label="send guess">
        ↑
      </StickerButton>
    </div>
  );
}
