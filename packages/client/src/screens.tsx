import type { RoomView } from '@moji/shared';

// All game screens now live in src/screens/ (Landing, Join, Lobby, Prompt,
// Create, Guess, Reveal, Leaderboard, Winner). SplashScreen is a transient
// fallback for the brief gaps between timed phases.

/** Shown to a player who joined mid-round (they have no prompt yet). */
export function JoiningNextRound() {
  return (
    <div className="mx-auto mt-24 max-w-md animate-moji-pop px-4 text-center">
      <div className="animate-moji-float text-6xl">👋</div>
      <div className="mt-4 font-display text-3xl font-extrabold">You're in next round!</div>
      <p className="mt-2 text-muted">
        You joined mid-round — sit tight, you'll get a secret prompt when the next round starts. Feel
        free to guess along in the meantime!
      </p>
    </div>
  );
}

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
