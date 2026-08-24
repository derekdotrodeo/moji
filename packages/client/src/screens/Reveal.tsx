import type { ActiveClueView, ChatMessage, RoomView } from '@moji/shared';
import type { GameClient } from '../useGame.js';
import { Eyebrow, Panel, cn } from '../ui.js';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function RevealScreen({ game, view }: { game: GameClient; view: RoomView }) {
  const clue = view.activeClue;
  if (!clue || !clue.answer) return null;
  const solved = !!clue.yourSolve;
  const fastest = clue.solves[0];

  const headline = solved
    ? { text: 'Solved! The answer was', color: 'text-mint' }
    : clue.youAreAuthor
      ? { text: 'Your clue was', color: 'text-cyan' }
      : { text: "Time's up! The answer was", color: 'text-coral' };

  return (
    <div className="mx-auto max-w-5xl animate-moji-pop px-4 py-8">
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: answer + decoded clue */}
        <div className="text-center lg:text-left">
          <Eyebrow className={headline.color}>{headline.text}</Eyebrow>
          <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">{clue.answer}</h1>

          <div className="mt-6 inline-grid grid-cols-5 gap-2">
            {clue.emojis.map((e, i) => (
              <span
                key={i}
                className="flex h-14 w-14 items-center justify-center rounded-tile border-[2.5px] border-outline bg-paper text-3xl shadow-sticker-sm"
              >
                {e}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            <span className="inline-flex items-center gap-2 rounded-pill border border-hairline2 bg-panel2 px-3 py-1.5 text-sm">
              clue by {clue.authorAvatar} <b>{clue.authorName}</b>
            </span>
            {!clue.youAreAuthor && <BumpButton clue={clue} onBump={() => void game.bump()} />}
          </div>

          {/* Now that the answer is out, everyone gets to see the back-channel. */}
          {game.chat.length > 0 && <ChatRecap messages={game.chat} />}
        </div>

        {/* Right: your result + stats */}
        <div className="space-y-4">
          <PointsCard clue={clue} />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Guessed it" value={`${clue.solvedCount} of ${clue.eligibleCount}`} />
            <Stat
              label="Fastest"
              value={fastest ? `${fastest.displayName} · ${secs(fastest.ms)}` : 'nobody 😬'}
            />
            <Stat
              label="You placed"
              value={clue.yourSolve ? `${ordinal(clue.yourSolve.rank)} · ${secs(clue.yourSolve.ms)}` : '—'}
            />
            <Stat
              label={`${clue.authorName} earned`}
              value={
                clue.bumpPoints > 0
                  ? `+${(clue.authorPoints ?? 0) + clue.bumpPoints}`
                  : `+${clue.authorPoints ?? 0}`
              }
              accent
              note={clue.bumpPoints > 0 ? `includes 👏 +${clue.bumpPoints}` : undefined}
            />
          </div>
          <div className="text-center font-mono text-xs uppercase tracking-[2px] text-cyan">
            <span className="mr-1 inline-block animate-moji-float">⏭️</span> next up…
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Applause, and the only scoring input the room has after the buzzer. Open to
 * everyone here (not just solvers) because the answer is out — nobody can be
 * tipped off by a bump any more.
 */
function BumpButton({ clue, onBump }: { clue: ActiveClueView; onBump: () => void }) {
  return (
    <button
      type="button"
      onClick={onBump}
      disabled={!clue.youCanBump}
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border-[2.5px] px-3 py-1.5 font-display text-sm font-extrabold transition-all',
        'hover:-translate-y-0.5 disabled:pointer-events-none',
        clue.youBumped
          ? 'border-outline bg-gold text-outline shadow-sticker-sm'
          : 'border-gold text-gold hover:bg-gold hover:text-outline',
      )}
    >
      👏 {clue.youBumped ? 'bumped' : 'bump'}
      {clue.bumps > 0 && <span className="font-mono text-xs opacity-80">×{clue.bumps}</span>}
    </button>
  );
}

/** What the solvers were saying while everyone else was still stuck. */
function ChatRecap({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="mt-5 text-left">
      <Eyebrow className="mb-2 text-cyan">From the solvers</Eyebrow>
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {messages.map((m) => (
          <div
            key={m.id}
            className="flex items-start gap-2 rounded-tile border-l-[3px] border-cyan bg-cyan/10 px-3 py-1.5 text-sm"
          >
            <span className="text-base leading-tight">{m.avatar}</span>
            <span className="font-semibold text-cyan">{m.playerName}</span>
            <span className="flex-1 break-words text-text-2">{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PointsCard({ clue }: { clue: ActiveClueView }) {
  let line: string;
  if (clue.yourSolve) {
    line = `you guessed ${ordinal(clue.yourSolve.rank)} · ${secs(clue.yourSolve.ms)} · +${clue.yourSolve.points} pts`;
  } else if (clue.youAreAuthor) {
    const earned = (clue.authorPoints ?? 0) + clue.bumpPoints;
    line =
      clue.bumps > 0
        ? `your clue earned +${earned} pts · ${clue.bumps} 👏`
        : `your clue earned +${earned} pts`;
  } else {
    line = "you didn't get this one 😬";
  }
  return (
    <Panel className="border-gold bg-gold/10 p-4 text-center">
      <div className="font-display text-lg font-extrabold text-gold">{line}</div>
    </Panel>
  );
}

function Stat({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: string;
  accent?: boolean;
  note?: string;
}) {
  return (
    <Panel className="p-3">
      <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted">{label}</div>
      <div className={cn('mt-1 font-display font-extrabold', accent ? 'text-gold' : 'text-paper')}>
        {value}
      </div>
      {note && <div className="mt-0.5 font-mono text-[10px] text-muted-3">{note}</div>}
    </Panel>
  );
}
