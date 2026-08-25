import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import type { ActiveClueView, ChatMessage, PublicGuess, RoomView } from '@moji/shared';
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
  // Solving ends your round on this clue: the blanks stop being a puzzle and
  // the guess box stops being usable, so both give way to the payoff.
  const solved = !!clue.yourSolve;

  return (
    <div className="mx-auto flex h-[100dvh] max-w-7xl flex-col gap-4 px-4 py-4 lg:grid lg:grid-cols-[236px_1fr_372px]">
      {/* Live scores rail (desktop) */}
      <aside className="hidden self-start lg:block">
        <Eyebrow className="mb-2">Live Scores</Eyebrow>
        <ScoresRail view={view} myId={game.myId} />
      </aside>

      {/* Center: the clue hero */}
      <main className="flex shrink-0 flex-col items-center text-center lg:flex-1 lg:justify-center">
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
          {clue.authorAvatar} {clue.authorName}'s clue · {view.category?.name}
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

        {!clue.youAreAuthor && !solved && guessing && game.hint && <HintBlanks hint={game.hint} />}

        {clue.youAreAuthor ? (
          <p className="mt-8 text-muted">
            This is your clue — sit back and watch the chaos 🍿
            <br />
            <span className="text-muted-3">(answer: {clue.answer})</span>
          </p>
        ) : solved ? (
          <SolvedBanner clue={clue} onBump={() => void game.bump()} />
        ) : !guessing ? (
          <p className="mt-8 animate-moji-pulse font-display text-xl font-extrabold text-cyan">
            get ready…
          </p>
        ) : null}
      </main>

      {/* Right panel: timer + score + feed + input */}
      <section className="flex min-h-0 flex-1 flex-col">
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
          <GuessFeed feed={game.feed} chat={game.chat} myId={game.myId} avatarOf={avatarOf} />
          {solved || clue.youAreAuthor ? (
            // You already know the answer, so the guess box would only reject
            // you. Talk to the others who know instead.
            <ChatInput disabled={!guessing} onSubmit={(t) => void game.sendChat(t)} />
          ) : (
            <GuessInput disabled={!guessing} onSubmit={(t) => game.submitGuess(t)} />
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * What a solver sees for the rest of the window. Three jobs: confirm the solve
 * and what it paid, show the answer they earned, and give them something to do
 * with the clue — bumping pays its author and is the only way to say "that was
 * a good one" without leaking it to the people still guessing.
 */
function SolvedBanner({ clue, onBump }: { clue: ActiveClueView; onBump: () => void }) {
  const stillGuessing = Math.max(0, clue.eligibleCount - clue.solvedCount);
  return (
    <div className="mt-8 flex animate-moji-pop flex-col items-center gap-3">
      <div className="flex items-center gap-3 rounded-sticker border-[2.5px] border-outline bg-mint px-4 py-2 text-outline shadow-sticker">
        <span className="font-display text-lg font-extrabold">got it!</span>
        <span className="rounded-pill bg-outline px-2.5 py-0.5 font-mono text-sm text-mint">
          +{clue.yourSolve?.points ?? 0}
        </span>
      </div>

      <p className="font-display text-2xl font-extrabold text-paper">{clue.answer}</p>

      <p className="font-mono text-xs uppercase tracking-[1.5px] text-muted">
        {stillGuessing > 0
          ? `${stillGuessing} still guessing…`
          : 'everybody got it — nice clue'}
      </p>

      <button
        type="button"
        onClick={onBump}
        disabled={!clue.youCanBump}
        className={cn(
          'flex items-center gap-2 rounded-pill border-[2.5px] px-4 py-1.5 font-display text-sm font-extrabold transition-all',
          'hover:-translate-y-0.5 disabled:pointer-events-none',
          clue.youBumped
            ? 'border-outline bg-gold text-outline shadow-sticker-sm'
            : 'border-gold text-gold hover:bg-gold hover:text-outline',
        )}
      >
        👏 {clue.youBumped ? 'bumped' : 'bump this clue'}
        {clue.bumps > 0 && (
          <span className="font-mono text-xs opacity-80">×{clue.bumps}</span>
        )}
      </button>
      <p className="-mt-1 font-mono text-[10px] uppercase tracking-[1.5px] text-muted-3">
        a bump pays {clue.authorName} +50
      </p>
    </div>
  );
}

/** Letters and digits are the only characters a hint hides. */
const MASKABLE = /[\p{L}\p{N}]/u;

/**
 * The answer as blanks, filling in letter by letter while the clock runs.
 * Words stay together so a title never breaks mid-word; punctuation is shown
 * from the start and styled down, since it's structure rather than a gift.
 */
function HintBlanks({ hint }: { hint: string }) {
  return (
    <div
      className="mt-7 flex flex-wrap items-end justify-center gap-x-5 gap-y-2"
      role="status"
      aria-label={`Answer so far: ${hint.replace(/_/g, ' blank ')}`}
    >
      {hint.split(' ').map((word, w) => (
        <div key={w} className="flex gap-1" aria-hidden="true">
          {[...word].map((ch, i) => {
            const blank = ch === '_';
            const letter = MASKABLE.test(ch);
            return (
              <span
                key={i}
                className={cn(
                  'flex h-9 w-6 items-center justify-center font-mono text-2xl font-bold uppercase sm:w-7',
                  blank && 'border-b-[3px] border-muted-5',
                  letter && !blank && 'animate-moji-pop border-b-[3px] border-lime text-lime',
                  !letter && 'text-muted-3',
                )}
              >
                {blank ? '' : ch}
              </span>
            );
          })}
        </div>
      ))}
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

/** How close to the bottom still counts as "following along". */
const NEAR_BOTTOM_PX = 48;

/**
 * One row of the feed. Public guesses and solver chat share a scroll so the
 * conversation reads in order, but they are visually separate: chat only ever
 * reaches players who already know the answer, and it must never be mistaken
 * for something everyone can see.
 */
type FeedRow =
  | { kind: 'guess'; id: string; at: number; guess: PublicGuess }
  | { kind: 'chat'; id: string; at: number; message: ChatMessage };

function GuessFeed({
  feed,
  chat,
  myId,
  avatarOf,
}: {
  feed: PublicGuess[];
  chat: ChatMessage[];
  myId: string | null;
  avatarOf: (id: string) => string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  const rows = useMemo<FeedRow[]>(() => {
    const merged: FeedRow[] = [
      ...feed.map((g): FeedRow => ({ kind: 'guess', id: g.id, at: g.at, guess: g })),
      ...chat.map((m): FeedRow => ({ kind: 'chat', id: m.id, at: m.at, message: m })),
    ];
    // Tie-break on id so a guess and a chat stamped the same millisecond don't
    // swap places between renders.
    return merged.sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
  }, [feed, chat]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setPinned(true);
  }, []);

  // Oldest at the top, newest at the bottom by the input (chat convention).
  // Follow the newest guess automatically, but don't yank a player who has
  // scrolled up to read — they get a "jump to newest" pill instead.
  useEffect(() => {
    if (rows.length === 0) {
      setPinned(true); // new clue: the feed resets, so start following again
      return;
    }
    if (pinned) scrollToBottom();
  }, [rows.length, pinned, scrollToBottom]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-3">
        {rows.length === 0 ? (
          <div className="py-8 text-center text-muted">be the first to guess… ⚡</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((row) =>
              row.kind === 'chat' ? (
                <ChatRow key={row.id} message={row.message} mine={row.message.playerId === myId} />
              ) : (
                <GuessRow
                  key={row.id}
                  guess={row.guess}
                  mine={row.guess.guesserId === myId}
                  avatar={avatarOf(row.guess.guesserId)}
                />
              ),
            )}
          </div>
        )}
      </div>

      {!pinned && rows.length > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute inset-x-0 bottom-2 mx-auto w-max rounded-pill border-2 border-outline bg-cyan px-3 py-1 font-display text-xs font-extrabold text-outline shadow-sticker-sm"
        >
          newest ↓
        </button>
      )}
    </div>
  );
}

function GuessRow({
  guess,
  mine,
  avatar,
}: {
  guess: PublicGuess;
  mine: boolean;
  avatar: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-tile px-3 py-1.5 text-sm',
        guess.isCorrect ? 'bg-mint font-semibold text-outline' : 'bg-inset',
      )}
    >
      <span className="text-lg">{avatar}</span>
      <span className={cn('font-semibold', mine && !guess.isCorrect && 'text-gold')}>
        {guess.guesserName}
      </span>
      {guess.isCorrect ? (
        <>
          <span className="flex-1">guessed it!</span>
          <span className="rounded-pill bg-outline px-2 py-0.5 font-mono text-xs text-mint">
            +{guess.points}
          </span>
        </>
      ) : (
        <span className="flex-1 text-text-2">{guess.text}</span>
      )}
    </div>
  );
}

/**
 * A solver-channel message. Cyan and rail-marked so it reads as a different
 * room from the public guesses — you are looking at something the players still
 * guessing cannot see, and that has to be obvious at a glance before anyone
 * types the answer into it.
 */
function ChatRow({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-tile border-l-[3px] border-cyan bg-cyan/10 px-3 py-1.5 text-sm">
      <span className="text-lg leading-tight">{message.avatar}</span>
      <span className={cn('font-semibold', mine ? 'text-gold' : 'text-cyan')}>
        {message.playerName}
      </span>
      <span className="flex-1 break-words text-text-2">{message.text}</span>
    </div>
  );
}

/** Chat for the players who already know the answer. */
function ChatInput({
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
    <div className="border-t border-hairline2 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-cyan" />
        <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-cyan">
          solvers only · hidden from the rest
        </span>
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={disabled}
          placeholder={disabled ? 'chat closes with the clue…' : 'say something…'}
          maxLength={200}
          className="w-full rounded-tile border-2 border-cyan/40 bg-inset px-4 py-2.5 outline-none focus:border-cyan disabled:opacity-50"
        />
        <StickerButton variant="cyan" onClick={send} disabled={disabled} aria-label="send message">
          ↑
        </StickerButton>
      </div>
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
