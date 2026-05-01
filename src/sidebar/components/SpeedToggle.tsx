import { Zap, Sparkles } from 'lucide-react';
import type { SpeedMode } from '../../services/types';

interface Props {
  speed: SpeedMode;
  onChange: (s: SpeedMode) => void;
}

export default function SpeedToggle({ speed, onChange }: Props) {
  return (
    <div className="inline-flex items-center bg-elevated rounded-full p-0.5 border border-border text-[11.5px]">
      <button
        onClick={() => onChange('fast')}
        className={`flex items-center gap-1 px-2.5 h-6 rounded-full transition-colors ${
          speed === 'fast'
            ? 'bg-bg text-ink shadow-sm'
            : 'text-muted hover:text-ink'
        }`}
      >
        <Zap size={11} />
        Fast
      </button>
      <button
        onClick={() => onChange('quality')}
        className={`flex items-center gap-1 px-2.5 h-6 rounded-full transition-colors ${
          speed === 'quality'
            ? 'bg-bg text-ink shadow-sm'
            : 'text-muted hover:text-ink'
        }`}
      >
        <Sparkles size={11} />
        Quality
      </button>
    </div>
  );
}
