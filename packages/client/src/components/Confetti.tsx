import { useMemo } from 'react';

const PIECES = ['🎉', '✨', '🎊', '⭐', '💖', '🟡', '🔵', '🟢', '🟣'];

/** One-shot confetti burst (design: win / correct moments). Honors reduced
 * motion via the global CSS animation kill-switch. */
export function Confetti({ count = 60 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.6 + Math.random() * 1.6,
        emoji: PIECES[Math.floor(Math.random() * PIECES.length)]!,
        size: 14 + Math.random() * 16,
        key: i,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <span
          key={b.key}
          className="absolute top-[-24px] animate-moji-confetti"
          style={{
            left: `${b.left}%`,
            fontSize: b.size,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
          }}
        >
          {b.emoji}
        </span>
      ))}
    </div>
  );
}
