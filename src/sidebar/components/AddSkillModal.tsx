import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Skill } from '../../services/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: { name: string; emoji: string; description: string; instructions: string }) => Promise<void>;
  /** When provided, the modal opens in edit mode with fields pre-filled. */
  editingSkill?: Skill | null;
  onUpdate?: (id: string, input: { name: string; emoji: string; description: string; instructions: string }) => Promise<void>;
}

const EMOJIS = ['⚡', '🧠', '✅', '🌐', '✨', '📄', '🧪', '🎯', '🔍', '📝', '🎨', '🚀', '🎵', '🔧', '💡', '📊'];

export default function AddSkillModal({ open, onClose, onSave, editingSkill, onUpdate }: Props) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⚡');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const isEditing = !!editingSkill;

  useEffect(() => {
    if (open && editingSkill) {
      setName(editingSkill.name);
      setEmoji(editingSkill.emoji ?? '⚡');
      setDescription(editingSkill.description ?? '');
      setInstructions(editingSkill.instructions);
    } else if (!open) {
      setName('');
      setEmoji('⚡');
      setDescription('');
      setInstructions('');
      setSaving(false);
    }
  }, [open, editingSkill]);

  if (!open) return null;

  const canSave = name.trim().length > 0 && instructions.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        emoji,
        description: description.trim(),
        instructions: instructions.trim(),
      };
      if (isEditing && onUpdate) {
        await onUpdate(editingSkill!.id, payload);
      } else {
        await onSave(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">{isEditing ? 'Edit skill' : 'Add skill'}</div>
            <div className="text-[11px] text-muted">
              {isEditing
                ? editingSkill?.builtin
                  ? 'Editing built-in — you can reset it later'
                  : 'Update your custom skill'
                : 'Reusable prompt for repetitive tasks'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-[11.5px] text-muted mb-1.5 font-medium">Name</label>
            <div className="flex items-center gap-2 bg-bg rounded-lg border border-border focus-within:border-accent/50 px-2.5">
              <select
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="bg-transparent text-[16px] py-2 cursor-pointer outline-none"
              >
                {EMOJIS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Give your skill a name"
                className="flex-1 bg-transparent py-2 text-[13.5px] placeholder:text-soft outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11.5px] text-muted mb-1.5 font-medium">
              Description <span className="text-soft">(optional)</span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One short line shown in the menu"
              className="w-full bg-bg rounded-lg border border-border focus-within:border-accent/50 px-3 py-2 text-[13.5px] placeholder:text-soft outline-none"
            />
          </div>

          <div>
            <label className="block text-[11.5px] text-muted mb-1.5 font-medium">Instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Example: Simplify this concept for a child who is 8 years old. Use simple language and an analogy. Keep it under 150 words."
              className="w-full bg-bg rounded-lg border border-border focus-within:border-accent/50 px-3 py-2 text-[13px] placeholder:text-soft resize-none outline-none leading-relaxed"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 bg-bg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
              canSave
                ? 'bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20'
                : 'bg-elevated text-soft cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
