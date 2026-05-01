/**
 * ContextRing — a small circular progress indicator that shows
 * how much of the model's context window is being used.
 *
 * Inspired by Claude's "Context 307.2k / 1.0M (31%)" display.
 */

interface Props {
  used: number;      // tokens currently used
  max: number;       // max context window
  className?: string;
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ContextRing({ used, max, className = '' }: Props) {
  const pct = max > 0 ? Math.min(used / max, 1) : 0;
  const pctDisplay = Math.round(pct * 100);

  // SVG ring params
  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);

  // Color: green → yellow → red
  let ringColor = 'rgb(var(--nb-accent))';
  if (pct > 0.7) ringColor = '#f59e0b'; // amber
  if (pct > 0.9) ringColor = '#ef4444'; // red

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={`Context: ${formatK(used)} / ${formatK(max)} (${pctDisplay}%)`}>
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="opacity-15"
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="text-[10px] tabular-nums">
        {formatK(used)} / {formatK(max)} ({pctDisplay}%)
      </span>
    </span>
  );
}
