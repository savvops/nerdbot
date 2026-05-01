import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { Plus, Search } from 'lucide-react';
import type { Skill } from '../../services/types';

interface Props {
  open: boolean;
  query: string;
  skills: Skill[];
  onPick: (skill: Skill) => void;
  onAddSkill: () => void;
  onBrowse: () => void;
  onClose: () => void;
}

export default function SkillsMenu({
  open,
  query,
  skills,
  onPick,
  onAddSkill,
  onBrowse,
  onClose,
}: Props) {
  const [highlight, setHighlight] = useState(0);
  const fuse = useMemo(
    () => new Fuse(skills, { keys: ['name', 'description'], threshold: 0.4 }),
    [skills]
  );
  const results = useMemo(() => {
    const q = query.replace(/^\//, '').trim();
    if (!q) return skills;
    return fuse.search(q).map((r) => r.item);
  }, [fuse, query, skills]);

  const items = results.slice(0, 10);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, items.length + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        if (highlight < items.length) {
          e.preventDefault();
          onPick(items[highlight]);
        } else if (highlight === items.length) {
          e.preventDefault();
          onAddSkill();
        } else {
          e.preventDefault();
          onBrowse();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, highlight, onPick, onAddSkill, onBrowse, onClose]);

  if (!open) return null;

  return (
    <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 mx-3 rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up z-40">
      <div className="px-3 pt-2.5 pb-1.5 text-[11px] uppercase tracking-wide text-muted font-medium flex items-center gap-1.5">
        <Search size={11} />
        Suggested skills
      </div>
      <div className="max-h-[260px] overflow-y-auto pb-1">
        {items.length === 0 && (
          <div className="px-3 py-3 text-[12.5px] text-muted">
            No matching skill — try “Add skill”.
          </div>
        )}
        {items.map((s, i) => (
          <button
            key={s.id}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => onPick(s)}
            className={`w-full text-left flex items-start gap-2.5 px-3 py-2 transition-colors ${
              highlight === i ? 'bg-elevated' : 'hover:bg-elevated/60'
            }`}
          >
            <span className="text-[16px] leading-none mt-0.5">{s.emoji ?? '⚡'}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-ink truncate">{s.name}</span>
              {s.description && (
                <span className="block text-[11.5px] text-muted truncate">{s.description}</span>
              )}
            </span>
            {!s.builtin && (
              <span className="text-[10px] text-accent/80 mt-1">custom</span>
            )}
          </button>
        ))}
      </div>
      <div className="border-t border-border">
        <button
          onMouseEnter={() => setHighlight(items.length)}
          onClick={onAddSkill}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
            highlight === items.length ? 'bg-elevated text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          <Plus size={13} />
          Add skill
        </button>
        <button
          onMouseEnter={() => setHighlight(items.length + 1)}
          onClick={onBrowse}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
            highlight === items.length + 1 ? 'bg-elevated text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          <Search size={13} />
          Browse skills
        </button>
      </div>
    </div>
  );
}
