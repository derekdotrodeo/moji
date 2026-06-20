/**
 * Shared "sticker" UI primitives (design handoff §"sticker treatment").
 * Chunky outline + hard offset shadow; hover lifts, press sinks.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const AVATAR_BG = ['bg-pink', 'bg-cyan', 'bg-lime', 'bg-gold', 'bg-mint', 'bg-orange'];

/** Deterministic per-player avatar background color. */
export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h + ch.charCodeAt(0)) % AVATAR_BG.length;
  return AVATAR_BG[h]!;
}

/** Rounded sticker avatar tile with a per-player background. */
export function Avatar({
  emoji,
  id,
  className,
}: {
  emoji: string;
  id: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-tile border-[2.5px] border-outline shadow-sticker-sm',
        avatarColor(id),
        className,
      )}
    >
      {emoji}
    </span>
  );
}

interface SegmentedProps<T extends string | number> {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

/** Pill segmented control; selected segment is a gold sticker. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className="inline-flex gap-1 rounded-pill border border-hairline2 bg-inset p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-pill px-3 py-1.5 font-mono text-sm transition-all disabled:opacity-50',
            o.value === value
              ? 'border-[2.5px] border-outline bg-gold text-outline shadow-sticker-sm'
              : 'border-[2.5px] border-transparent text-muted hover:text-paper',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Variant = 'lime' | 'pink' | 'cyan' | 'gold' | 'mint' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  lime: 'bg-lime text-outline border-outline shadow-sticker hover:shadow-sticker-hover',
  pink: 'bg-pink text-outline border-outline shadow-sticker hover:shadow-sticker-hover',
  cyan: 'bg-cyan text-outline border-outline shadow-sticker hover:shadow-sticker-hover',
  gold: 'bg-gold text-outline border-outline shadow-sticker hover:shadow-sticker-hover',
  mint: 'bg-mint text-outline border-outline shadow-sticker hover:shadow-sticker-hover',
  // Secondary CTA: transparent fill, pink border + pink hard shadow.
  outline:
    'bg-transparent text-paper border-pink shadow-[4px_4px_0_#FF3DA5] hover:shadow-[6px_6px_0_#FF3DA5]',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3.5 text-lg',
};

interface StickerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function StickerButton({
  variant = 'lime',
  size = 'md',
  className,
  children,
  ...rest
}: StickerButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-sticker border-[2.5px]',
        'font-display font-extrabold transition-all duration-100',
        'hover:-translate-x-0.5 hover:-translate-y-0.5',
        'active:translate-x-0.5 active:translate-y-0.5 active:shadow-sticker-press',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Mono uppercase label (the recurring "eyebrow" above headlines). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('font-mono text-xs uppercase tracking-[2px] text-muted', className)}>
      {children}
    </div>
  );
}

/** A bordered panel/card surface. */
export function Panel({
  children,
  className,
  pop = false,
}: {
  children: ReactNode;
  className?: string;
  pop?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-hairline2 bg-panel',
        pop && 'animate-moji-pop',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The MOJI wordmark — 4 rotated sticker letter-tiles. */
const LETTERS: Array<{ ch: string; fill: string; rot: string }> = [
  { ch: 'M', fill: 'bg-pink', rot: '-rotate-3' },
  { ch: 'O', fill: 'bg-cyan', rot: 'rotate-2' },
  { ch: 'J', fill: 'bg-lime', rot: '-rotate-2' },
  { ch: 'I', fill: 'bg-gold', rot: 'rotate-3' },
];

export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const tile =
    size === 'lg' ? 'h-16 w-16 text-4xl sm:h-20 sm:w-20 sm:text-5xl' : 'h-11 w-11 text-2xl';
  return (
    <div className="flex items-center gap-1.5">
      {LETTERS.map((l) => (
        <span
          key={l.ch}
          className={cn(
            'inline-flex items-center justify-center rounded-tile border-[2.5px] border-outline',
            'font-display font-extrabold text-outline shadow-sticker-sm',
            l.fill,
            l.rot,
            tile,
          )}
        >
          {l.ch}
        </span>
      ))}
    </div>
  );
}
