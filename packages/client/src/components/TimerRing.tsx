import { useEffect, useState, type ReactNode } from 'react';

const R = 20;
const CIRC = 2 * Math.PI * R;

interface Props {
  /** server epoch ms when the phase ends */
  deadlineTs: number | null;
  /** total duration of the phase in ms (for the progress fraction) */
  totalMs: number;
  size?: number;
  /** switch the ring to coral when remaining drops below this (ms) */
  dangerBelowMs?: number;
  /** override the center content (defaults to seconds remaining) */
  children?: ReactNode;
}

/** Circular SVG countdown ring (design: lime, turns coral ≤10s). */
export function TimerRing({ deadlineTs, totalMs, size = 96, dangerBelowMs = 10_000, children }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const remaining = deadlineTs ? Math.max(0, deadlineTs - now) : totalMs;
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0;
  const danger = remaining <= dangerBelowMs;
  const color = danger ? '#FF5468' : '#BFFB4B';
  const secs = Math.ceil(remaining / 1000);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle cx="24" cy="24" r={R} fill="none" stroke="#2c1a42" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset .1s linear, stroke .2s' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono font-bold">
        {children ?? <span className={danger ? 'text-coral' : 'text-paper'}>{secs}</span>}
      </div>
    </div>
  );
}
