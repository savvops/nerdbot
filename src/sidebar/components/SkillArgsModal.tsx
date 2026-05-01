import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Skill } from '../../services/types';

interface Props {
  skill: Skill | null;
  onClose: () => void;
  onConfirm: (args: Record<string, string>) => void;
}

export default function SkillArgsModal({ skill, onClose, onConfirm }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (skill) {
      const init: Record<string, string> = {};
      skill.args?.forEach((a) => {
        init[a.key] = skill.lastArgs?.[a.key] ?? '';
      });
      setValues(init);
    }
  }, [skill]);

  if (!skill || !skill.args || skill.args.length === 0) return null;

  const allFilled = skill.args.every((a) => values[a.key]?.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">{skill.emoji}</span>
            <div>
              <div className="text-[13.5px] font-semibold">{skill.name}</div>
              <div className="text-[11px] text-muted">Set inputs</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {skill.args.map((a) => (
            <div key={a.key}>
              <label className="block text-[11.5px] text-muted mb-1.5 font-medium">
                {a.label}
              </label>
              <input
                value={values[a.key] ?? ''}
                onChange={(e) => setValues({ ...values, [a.key]: e.target.value })}
                placeholder={a.placeholder}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allFilled) onConfirm(values);
                }}
                className="w-full bg-bg border border-border focus-within:border-accent/50 rounded-lg px-3 py-2 text-[13px] outline-none"
              />
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 bg-bg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => allFilled && onConfirm(values)}
            disabled={!allFilled}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              allFilled
                ? 'bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20'
                : 'bg-elevated text-soft cursor-not-allowed'
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
