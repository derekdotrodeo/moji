import { Eyebrow, Panel, StickerButton, Wordmark, cn } from '../ui.js';

const FLOATING = ['🦁', '👑', '🌅', '🍕', '🚀', '🎬'];

const STEPS = [
  { n: 1, chip: 'bg-pink', title: 'Get a secret prompt', sub: 'Movies, games, food, places…' },
  { n: 2, chip: 'bg-cyan', title: 'Build a clue with 1–10 emoji', sub: 'No words. Just vibes.' },
  { n: 3, chip: 'bg-lime', title: 'Race to guess — fast = more points', sub: 'First in wins big.' },
];

const PROOF = ['😎', '🦊', '👽', '🐙', '🤖'];

export function Landing({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="mx-auto max-w-5xl animate-moji-pop px-4 py-10">
      <div className="grid items-center gap-10 md:grid-cols-2">
        {/* Hero */}
        <div className="space-y-6 text-center md:text-left">
          <div className="flex justify-center md:justify-start">
            <Wordmark size="lg" />
          </div>
          <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-5xl">
            Say it in emoji.
            <br />
            Guess it first.
          </h1>
          <p className="mx-auto max-w-md text-muted md:mx-0">
            The party game where every clue is 🦁👑🌅 and the fastest guess wins.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
            <StickerButton variant="lime" size="lg" onClick={onCreate}>
              Create a Room 🎉
            </StickerButton>
            <StickerButton variant="outline" size="lg" onClick={onJoin}>
              Join with a Code
            </StickerButton>
          </div>
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <div className="flex -space-x-2">
              {PROOF.map((e, i) => (
                <span
                  key={i}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-outline bg-panel2 text-lg"
                >
                  {e}
                </span>
              ))}
            </div>
            <span className="text-sm text-muted">
              <b className="text-paper">128,402</b> clues guessed this week
            </span>
          </div>
        </div>

        {/* Floating preview card */}
        <Panel className="hidden -rotate-2 p-6 shadow-sticker-lg md:block">
          <Eyebrow className="text-cyan">🦊 BEX'S CLUE · NAME THE MOVIE</Eyebrow>
          <div className="my-5 flex flex-wrap justify-center gap-2 text-4xl">
            {FLOATING.map((e, i) => (
              <span
                key={i}
                className="inline-flex h-14 w-14 items-center justify-center rounded-tile border-[2.5px] border-outline bg-paper shadow-sticker-sm"
              >
                {e}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            <FeedRow name="tarek" guess="The Lion King?" />
            <FeedRow name="mona" guess="jungle book" correct={false} />
            <FeedRow name="you" guess="" correct />
          </div>
        </Panel>
      </div>

      {/* How it works */}
      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <Panel key={s.n} className="p-5">
            <span
              className={cn(
                'mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] border-outline font-display font-extrabold text-outline shadow-sticker-sm',
                s.chip,
              )}
            >
              {s.n}
            </span>
            <div className="font-display text-lg font-extrabold">{s.title}</div>
            <div className="text-sm text-muted">{s.sub}</div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function FeedRow({ name, guess, correct }: { name: string; guess: string; correct?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-tile px-3 py-1.5 text-sm',
        correct ? 'bg-mint font-semibold text-outline' : 'bg-inset',
      )}
    >
      <span className="text-muted">{name}:</span>
      <span>{correct ? '✓ solved it! +900' : guess}</span>
    </div>
  );
}
