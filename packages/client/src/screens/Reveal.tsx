import type { ActiveClueView, RoomView } from '@moji/shared';
import { Eyebrow, Panel, cn } from '../ui.js';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function RevealScreen({ view }: { view: RoomView }) {
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

          <div className="mt-4">
            <span className="inline-flex items-center gap-2 rounded-pill border border-hairline2 bg-panel2 px-3 py-1.5 text-sm">
              clue by {clue.authorAvatar} <b>{clue.authorName}</b>
            </span>
          </div>
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
              value={`+${clue.authorPoints ?? 0}`}
              accent
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

function PointsCard({ clue }: { clue: ActiveClueView }) {
  let line: string;
  if (clue.yourSolve) {
    line = `you guessed ${ordinal(clue.yourSolve.rank)} · ${secs(clue.yourSolve.ms)} · +${clue.yourSolve.points} pts`;
  } else if (clue.youAreAuthor) {
    line = `your clue earned +${clue.authorPoints ?? 0} pts`;
  } else {
    line = "you didn't get this one 😬";
  }
  return (
    <Panel className="border-gold bg-gold/10 p-4 text-center">
      <div className="font-display text-lg font-extrabold text-gold">{line}</div>
    </Panel>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Panel className="p-3">
      <div className="font-mono text-[10px] uppercase tracking-[2px] text-muted">{label}</div>
      <div className={cn('mt-1 font-display font-extrabold', accent ? 'text-gold' : 'text-paper')}>
        {value}
      </div>
    </Panel>
  );
}
