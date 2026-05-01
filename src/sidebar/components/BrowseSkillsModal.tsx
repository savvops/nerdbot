import { Edit3, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { Skill } from '../../services/types';
import { BUILTIN_SKILLS } from '../../services/skills';

interface Props {
  open: boolean;
  skills: Skill[];
  onClose: () => void;
  onPick: (s: Skill) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (s: Skill) => void;
  onReset: (id: string) => void;
}

export default function BrowseSkillsModal({
  open,
  skills,
  onClose,
  onPick,
  onAdd,
  onDelete,
  onEdit,
  onReset,
}: Props) {
  if (!open) return null;
  const builtin = skills.filter((s) => s.builtin);
  const custom = skills.filter((s) => !s.builtin);

  // Detect which built-in skills have been overridden
  const overriddenIds = new Set<string>();
  for (const s of builtin) {
    const orig = BUILTIN_SKILLS.find((b) => b.id === s.id);
    if (orig && (orig.name !== s.name || orig.instructions !== s.instructions || orig.description !== s.description || orig.emoji !== s.emoji)) {
      overriddenIds.add(s.id);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">All skills</div>
            <div className="text-[11px] text-muted">{skills.length} available</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-4 flex-1">
          <Section
            title="Built-in"
            items={builtin}
            onPick={onPick}
            onEdit={onEdit}
            overriddenIds={overriddenIds}
            onReset={onReset}
          />
          <Section
            title="Your skills"
            items={custom}
            onPick={onPick}
            onEdit={onEdit}
            onDelete={onDelete}
            empty="You haven't added any custom skills yet."
          />
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-bg">
          <span className="text-[11px] text-muted">Skills are saved to this device.</span>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-ink text-[12.5px]"
          >
            <Plus size={12} />
            New skill
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  onPick,
  onEdit,
  onDelete,
  onReset,
  overriddenIds,
  empty,
}: {
  title: string;
  items: Skill[];
  onPick: (s: Skill) => void;
  onEdit: (s: Skill) => void;
  onDelete?: (id: string) => void;
  onReset?: (id: string) => void;
  overriddenIds?: Set<string>;
  empty?: string;
}) {
  return (
    <div>
      <div className="px-1 pb-1.5 text-[11px] uppercase tracking-wide text-muted font-medium">
        {title}
      </div>
      <div className="space-y-1">
        {items.length === 0 && empty && (
          <div className="px-3 py-3 text-[12.5px] text-muted">{empty}</div>
        )}
        {items.map((s) => {
          const isOverridden = overriddenIds?.has(s.id);
          return (
            <div
              key={s.id}
              className="group flex items-start gap-2.5 p-2.5 rounded-xl bg-bg hover:bg-elevated border border-border transition-colors"
            >
              <span className="text-[16px] leading-none mt-0.5">{s.emoji ?? '⚡'}</span>
              <button onClick={() => onPick(s)} className="flex-1 min-w-0 text-left">
                <div className="text-[13px] text-ink truncate flex items-center gap-1.5">
                  {s.name}
                  {isOverridden && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">edited</span>
                  )}
                </div>
                {s.description && (
                  <div className="text-[11.5px] text-muted truncate">{s.description}</div>
                )}
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(s)}
                  className="p-1 rounded text-muted hover:text-ink hover:bg-surface"
                  title="Edit"
                >
                  <Edit3 size={12} />
                </button>
                {isOverridden && onReset && (
                  <button
                    onClick={() => onReset(s.id)}
                    className="p-1 rounded text-muted hover:text-accent hover:bg-surface"
                    title="Reset to default"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1 rounded text-muted hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
