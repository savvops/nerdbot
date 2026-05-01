import { useState } from 'react';
import { formatTokens } from '../../services/contextLimits';

interface Props {
  used: number;
  limit: number;
  modelLabel: string;
}

/**
 * Tiny circular dial showing % of context window used.
 * Hover for a popover with the exact breakdown.
 */
export default function ContextDial({ used, limit, modelLabel }: Props) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, Math.max(0, (used / limit) * 100));
  const color = pct < 50 ? 'rgb(var(--nb-accent))'
    : pct < 75 ? 'rgb(245 158 11)'
    : pct < 90 ? 'rgb(249 115 22)'
    : 'rgb(var(--nb-danger))';

  // SVG ring math
  const size = 14;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <button
      type="button"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
      className="relative inline-flex items-center gap-1 text-[10.5px] text-soft hover:text-ink transition-colors"
      title="Context usage"
    >
      <svg width={size} height={size} className="-mt-px shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--nb-border))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 200ms, stroke 200ms' }}
        />
      </svg>
      <span style={{ color }}>{pct < 1 ? '<1' : Math.round(pct)}%</span>

      {open && (
        <div className="absolute bottom-[calc(100%+6px)] right-0 z-50 w-[220px] p-2.5 rounded-xl bg-elevated border border-border shadow-2xl text-left">
          <div className="text-[11px] font-semibold text-ink mb-1">Context usage</div>
          <div className="text-[10.5px] text-muted leading-snug space-y-0.5">
            <Row label="Used" value={`~${formatTokens(used)} tok`} />
            <Row label="Limit" value={`${formatTokens(limit)} tok`} valueColor={color} />
            <Row label="Model" value={modelLabel} mono />
          </div>
          {pct >= 75 && (
            <div className="mt-2 pt-2 border-t border-border text-[10.5px] text-ink">
              {pct >= 90
                ? '⚠️ Near the limit. Start a new chat or the next request may fail.'
                : 'Approaching the limit. Consider starting a new chat soon.'}
            </div>
          )}
          {pct < 75 && (
            <div className="mt-2 pt-2 border-t border-border text-[10.5px] text-soft">
              Nerdbot does not auto-compress. New chats start fresh.
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function Row({
  label,
  value,
  mono,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span
        className={mono ? 'font-mono text-[10px] truncate' : ''}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
