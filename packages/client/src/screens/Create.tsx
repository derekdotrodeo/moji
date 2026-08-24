import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { MAX_EMOJIS, type RoomView } from '@moji/shared';
import type { GameClient } from '../useGame.js';
import { EMOJI_CATS, type EmojiCat, type EmojiData, loadEmojiData } from '../data/emoji.js';
import { Eyebrow, Panel, StickerButton, cn } from '../ui.js';

export function ClueScreen({ game, view }: { game: GameClient; view: RoomView }) {
  const [emojis, setEmojis] = useState<string[]>([]);
  const [cat, setCat] = useState<EmojiCat>('Smileys');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<EmojiData | null>(null);

  useEffect(() => {
    loadEmojiData().then(setData);
  }, []);

  if (view.youSubmitted) return <Submitted view={view} />;

  const atCap = emojis.length >= MAX_EMOJIS;
  const grid: string[] = !data ? [] : query.trim() ? data.search(query) : data.byCat[cat];

  const add = (e: string) => !atCap && setEmojis((cur) => [...cur, e]);
  const removeAt = (i: number) => setEmojis((cur) => cur.filter((_, idx) => idx !== i));
  const move = (from: number, to: number) =>
    setEmojis((cur) => {
      if (from === to || to < 0 || to >= cur.length) return cur;
      const next = [...cur];
      const [tile] = next.splice(from, 1);
      if (tile === undefined) return cur;
      next.splice(to, 0, tile);
      return next;
    });

  const submit = async () => {
    if (emojis.length === 0 || busy) return;
    setBusy(true);
    try {
      await game.submitClue(emojis);
    } catch {
      /* surfaced via app error banner */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl animate-moji-pop px-4 py-6">
      {/* Top bar: prompt recap + timer */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Eyebrow className="text-cyan">Clue for · {view.category?.name}</Eyebrow>
          <div className="font-display text-2xl font-extrabold sm:text-3xl">{view.yourPrompt}</div>
          {view.youCanReshuffle && (
            <button
              onClick={() => game.reshuffle()}
              className="mt-1 font-mono text-xs uppercase tracking-[1.5px] text-muted hover:text-cyan"
            >
              🎲 stuck? reshuffle prompt ({view.yourReshufflesLeft} left)
            </button>
          )}
        </div>
        <TimerChip deadlineTs={view.deadlineTs} />
      </div>

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[440px_1fr]">
        {/* Builder: clue tray */}
        <div className="space-y-3">
          <div
            className={cn(
              'min-h-[7.5rem] rounded-card border-[3px] border-dashed p-3 transition-colors',
              emojis.length > 0 ? 'border-mint' : 'border-hairline2',
            )}
          >
            {emojis.length === 0 ? (
              <div className="flex h-full min-h-[6rem] items-center justify-center text-center text-muted">
                tap emoji below to build your clue… (up to {MAX_EMOJIS})
              </div>
            ) : (
              <ClueTray emojis={emojis} onMove={move} onRemove={removeAt} />
            )}
          </div>
          <div
            className={cn(
              'font-mono text-xs uppercase tracking-[2px]',
              atCap ? 'text-orange' : emojis.length > 0 ? 'text-mint' : 'text-muted',
            )}
          >
            {atCap
              ? `Max ${MAX_EMOJIS} emoji · ${emojis.length}/${MAX_EMOJIS}`
              : `Your clue · ${emojis.length}/${MAX_EMOJIS}${emojis.length > 0 ? ' ✓' : ''}`}
          </div>
          {emojis.length > 1 && (
            <div className="font-mono text-xs uppercase tracking-[2px] text-muted-3">
              drag to reorder · tap to remove
            </div>
          )}
        </div>

        {/* Picker: search + tabs + grid */}
        <Panel className="space-y-3 p-4">
          <div className="flex items-center gap-2 rounded-tile border-2 border-hairline2 bg-inset px-3 py-2 focus-within:border-lime">
            <span>🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search all emoji… (lion, pizza, heart)"
              className="w-full bg-transparent outline-none placeholder:text-muted-4"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_CATS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCat(c);
                  setQuery('');
                }}
                className={cn(
                  'rounded-pill border-[2.5px] px-3 py-1 text-sm transition-all',
                  !query && c === cat
                    ? 'border-outline bg-pink text-outline shadow-sticker-sm'
                    : 'border-hairline2 text-muted hover:text-paper',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {!data ? (
            <div className="py-10 text-center text-muted">loading emoji…</div>
          ) : grid.length === 0 ? (
            <div className="py-10 text-center text-muted">
              no emoji match that search 🔍 — try another word
            </div>
          ) : (
            <div className="grid max-h-[42vh] grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-9">
              {grid.map((e) => (
                <button
                  key={e}
                  onClick={() => add(e)}
                  disabled={atCap}
                  className="flex aspect-square items-center justify-center rounded-tile text-2xl transition-transform hover:scale-110 hover:bg-pink/20 active:scale-90 disabled:opacity-30 disabled:hover:scale-100"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Submit (full width; below picker on mobile, spans on desktop) */}
        <div className="md:col-span-2">
          <StickerButton
            variant="lime"
            size="lg"
            className="w-full"
            disabled={emojis.length === 0 || busy}
            onClick={submit}
          >
            {emojis.length === 0 ? 'Add at least 1 emoji' : 'Lock in Clue 🔒'}
          </StickerButton>
        </div>
      </div>
    </div>
  );
}

/** Pointer travel (px) that turns a tap into a drag. */
const DRAG_SLOP_PX = 6;

interface DragState {
  pointerId: number;
  /** slot the tile is in right now — updated live as it is dragged past others */
  index: number;
  /** where the press started, for the tap-vs-drag decision */
  startX: number;
  startY: number;
  /** offset from the slot centre to the pointer, so the tile tracks the finger */
  dx: number;
  dy: number;
  dragging: boolean;
}

/**
 * The clue tray. Tiles reorder by dragging (pointer events, so one code path
 * covers mouse and touch) and a press that never travels is still a tap to
 * remove — the gesture players already know from the first playtest.
 *
 * Slots are fixed grid cells; only their contents move. Each cell holds an
 * untransformed wrapper so hit-testing reads true slot rects while the dragged
 * tile carries a translate.
 */
function ClueTray({
  emojis,
  onMove,
  onRemove,
}: {
  emojis: string[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Handlers fire between renders, so they read the live drag from a ref.
  const dragRef = useRef<DragState | null>(null);
  const setDragState = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /** Index of the slot under the pointer, or null when it is outside the tray. */
  const slotUnder = (x: number, y: number): number | null => {
    for (let i = 0; i < emojis.length; i++) {
      const r = slots.current[i]?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  };

  const focusSlot = (index: number) =>
    requestAnimationFrame(() => slots.current[index]?.querySelector('button')?.focus());

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (e.button !== 0) return; // left button / touch / pen only
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      pointerId: e.pointerId,
      index,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      dragging: false,
    });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const travelled = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.dragging && travelled <= DRAG_SLOP_PX) return; // still a tap

    // Reorder as the tile passes over another slot, then re-centre it on the
    // pointer. Slot rects are positional, so this reads correctly even though
    // the reorder has not rendered yet.
    const over = slotUnder(e.clientX, e.clientY);
    const index = over === null ? d.index : over;
    if (index !== d.index) onMove(d.index, index);

    const r = slots.current[index]?.getBoundingClientRect();
    setDragState({
      ...d,
      index,
      dragging: true,
      dx: r ? e.clientX - (r.left + r.width / 2) : d.dx,
      dy: r ? e.clientY - (r.top + r.height / 2) : d.dy,
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setDragState(null);
    if (!d.dragging) onRemove(d.index); // a press that never travelled
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (d && d.pointerId === e.pointerId) setDragState(null);
  };

  // Keyboard equivalent of the drag, for anyone not using a pointer.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = e.key === 'ArrowLeft' ? index - 1 : e.key === 'ArrowRight' ? index + 1 : null;
    if (to !== null && to >= 0 && to < emojis.length) {
      e.preventDefault();
      onMove(index, to);
      focusSlot(to);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onRemove(index);
    }
  };

  return (
    <div className="grid grid-cols-5 gap-2">
      {emojis.map((e, i) => {
        const held = drag?.dragging && drag.index === i;
        return (
          <div
            key={`${e}-${i}`}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className={cn('relative aspect-square', held && 'z-10')}
          >
            <button
              onPointerDown={(ev) => onPointerDown(ev, i)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onKeyDown={(ev) => onKeyDown(ev, i)}
              title="drag to reorder · tap to remove"
              aria-label={`clue slot ${i + 1}: ${e}. Arrow keys move it, delete removes it.`}
              style={held ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.1)` } : undefined}
              className={cn(
                'absolute inset-0 flex touch-none select-none items-center justify-center rounded-tile border-[2.5px] border-outline bg-paper text-3xl',
                held
                  ? 'cursor-grabbing shadow-sticker-lg'
                  : 'animate-moji-tilebob cursor-grab shadow-sticker-sm',
              )}
            >
              {e}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Submitted({ view }: { view: RoomView }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md animate-moji-pop flex-col items-center justify-center px-4 text-center">
      <div className="animate-moji-float text-7xl">🔒</div>
      <div className="mt-4 font-display text-3xl font-extrabold">Clue locked in!</div>
      <p className="mt-2 text-muted">Waiting for the rest of the squad…</p>
      <div className="mt-4">
        <TimerChip deadlineTs={view.deadlineTs} />
      </div>
    </div>
  );
}

function TimerChip({ deadlineTs }: { deadlineTs: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const remaining = deadlineTs ? Math.max(0, deadlineTs - now) : 0;
  const secs = Math.ceil(remaining / 1000);
  const danger = remaining <= 10_000;
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border-[2.5px] border-outline px-4 py-1.5 font-mono text-lg font-bold shadow-sticker-sm',
        danger ? 'bg-coral text-outline' : 'bg-gold text-outline',
      )}
    >
      {label}
    </span>
  );
}
