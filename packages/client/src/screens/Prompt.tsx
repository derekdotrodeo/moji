import { useEffect, useState } from 'react';
import type { RoomView } from '@moji/shared';
import { TimerRing } from '../components/TimerRing.js';
import { Eyebrow, cn } from '../ui.js';

const PROMPT_TOTAL_MS = 3100; // matches the server PROMPT_ASSIGNMENT phase

function categoryEmoji(view: RoomView): string {
  return view.packs.find((p) => p.slug === view.category?.slug)?.emoji ?? '🎬';
}

function CategoryBadge({ view }: { view: RoomView }) {
  return (
    <span className="inline-flex -rotate-2 items-center gap-2 rounded-pill border-[2.5px] border-outline bg-cyan px-4 py-1.5 font-mono text-sm font-bold uppercase tracking-[2px] text-outline shadow-sticker-sm">
      {categoryEmoji(view)} {view.category?.name ?? ''}
    </span>
  );
}

/** Brief category banner (ROUND_INTRO). */
export function RoundIntro({ view }: { view: RoomView }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md animate-moji-pop flex-col items-center justify-center px-4 text-center">
      <Eyebrow className="text-cyan">Round {view.roundNumber}</Eyebrow>
      <div className="my-4">
        <CategoryBadge view={view} />
      </div>
      <div className="font-display text-2xl font-extrabold text-muted">get ready…</div>
    </div>
  );
}

/** Secret prompt reveal + 3-2-1-GO countdown (PROMPT_ASSIGNMENT). */
export function PromptAssignment({ view }: { view: RoomView }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl animate-moji-pop flex-col items-center justify-center px-4 text-center">
      <Eyebrow className="text-cyan">Your Secret Prompt</Eyebrow>
      <div className="my-5">
        <CategoryBadge view={view} />
      </div>
      <h1 className="font-display text-5xl font-extrabold leading-tight sm:text-7xl">
        {view.yourPrompt}
      </h1>
      <p className="mt-5 text-muted">Memorize it. Don't say it. Build your clue 🤫</p>
      <div className="mt-8">
        <TimerRing deadlineTs={view.deadlineTs} totalMs={PROMPT_TOTAL_MS} size={104} dangerBelowMs={0}>
          <CountBeat deadlineTs={view.deadlineTs} />
        </TimerRing>
      </div>
    </div>
  );
}

/** Ticking 3 → 2 → 1 → GO! beat for the countdown ring center. */
function CountBeat({ deadlineTs }: { deadlineTs: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const remaining = deadlineTs ? Math.max(0, deadlineTs - now) : 0;
  const secs = Math.ceil(remaining / 1000);
  const label = secs > 3 ? '3' : secs > 0 ? String(secs) : 'GO!';
  return (
    <span
      key={label}
      className={cn('animate-moji-count font-display text-3xl font-extrabold text-gold')}
    >
      {label}
    </span>
  );
}
