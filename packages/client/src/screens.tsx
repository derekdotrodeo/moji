import type { RoomView } from '@moji/shared';

// All game screens now live in src/screens/ (Landing, Join, Lobby, Prompt,
// Create, Guess, Reveal, Leaderboard, Winner). SplashScreen is a transient
// fallback for the brief gaps between timed phases.

export function SplashScreen({ view }: { view: RoomView }) {
  return (
    <div className="mx-auto mt-24 max-w-md animate-moji-pop text-center">
      <div className="font-mono text-sm uppercase tracking-widest text-muted">
        Round {view.roundNumber}
      </div>
      <div className="mt-2 font-display text-4xl font-extrabold">
        {view.category?.name ?? 'Get ready'}
      </div>
      <div className="mt-4 text-muted">Dealing prompts…</div>
    </div>
  );
}
