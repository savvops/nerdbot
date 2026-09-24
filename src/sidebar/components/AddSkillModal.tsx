import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Skill } from '../../services/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    emoji: string;
    description: string;
    instructions: string;
    tools?: string[];
    environments?: ('nerdbot' | 'master_control' | 'sao')[];
  }) => Promise<void>;
  /** When provided, the modal opens in edit mode with fields pre-filled. */
  editingSkill?: Skill | null;
  onUpdate?: (
    id: string,
    input: {
      name: string;
      emoji: string;
      description: string;
      instructions: string;
      tools?: string[];
      environments?: ('nerdbot' | 'master_control' | 'sao')[];
    },
  ) => Promise<void>;
}

const EMOJIS = ['⚡', '🧠', '✅', '🌐', '✨', '📄', '🤖', '💻', '🧪', '🎯', '🔍', '📝', '🎨', '🚀', '🎵', '🔧', '💡', '📊'];

const TOOL_OPTIONS = [
  { id: 'browser', label: '🌐 Browser Actions' },
  { id: 'cli', label: '💻 CLI / Session Replay' },
  { id: 'web_search', label: '🔍 Web Search' },
  { id: 'rag', label: '📚 Knowledge Base / RAG' },
];

const ENV_OPTIONS: Array<{ id: 'nerdbot' | 'master_control' | 'sao'; label: string }> = [
  { id: 'nerdbot', label: 'Nerdbot (Browser)' },
  { id: 'master_control', label: 'Telegram agent' },
  { id: 'sao', label: 'Agent swarm' },
];

export default function AddSkillModal({ open, onClose, onSave, editingSkill, onUpdate }: Props) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⚡');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedEnvs, setSelectedEnvs] = useState<('nerdbot' | 'master_control' | 'sao')[]>(['nerdbot']);
  const [saving, setSaving] = useState(false);

  const isEditing = !!editingSkill;

  useEffect(() => {
    if (open && editingSkill) {
      setName(editingSkill.name);
      setEmoji(editingSkill.emoji ?? '⚡');
      setDescription(editingSkill.description ?? '');
      setInstructions(editingSkill.instructions);
      setSelectedTools(editingSkill.tools ?? []);
      setSelectedEnvs(editingSkill.environments ?? ['nerdbot']);
    } else if (!open) {
      setName('');
      setEmoji('⚡');
      setDescription('');
      setInstructions('');
      setSelectedTools([]);
      setSelectedEnvs(['nerdbot']);
      setSaving(false);
    }
  }, [open, editingSkill]);

  if (!open) return null;

  const canSave = name.trim().length > 0 && instructions.trim().length > 0 && !saving;

  const toggleTool = (id: string) => {
    setSelectedTools((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const toggleEnv = (id: 'nerdbot' | 'master_control' | 'sao') => {
    setSelectedEnvs((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        emoji,
        description: description.trim(),
        instructions: instructions.trim(),
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        environments: selectedEnvs.length > 0 ? selectedEnvs : undefined,
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
      <div className="w-full max-w-[420px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">{isEditing ? 'Edit Universal Skill' : 'Add Universal Skill'}</div>
            <div className="text-[11px] text-muted">
              {isEditing
                ? editingSkill?.builtin
                  ? 'Editing built-in — you can reset it later'
                  : 'Update skill definition'
                : 'Shared across Nerdbot and other agents'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 max-h-[65vh] overflow-y-auto">
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
                placeholder="Skill name"
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
              placeholder="Short summary of what this skill does"
              className="w-full bg-bg rounded-lg border border-border focus-within:border-accent/50 px-3 py-2 text-[13px] placeholder:text-soft outline-none"
            />
          </div>

          <div>
            <label className="block text-[11.5px] text-muted mb-1.5 font-medium">Instructions & Prompt</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              placeholder="System prompt instructions. Use {{variable}} for inputs, e.g. {{language}} or {{query}}."
              className="w-full bg-bg rounded-lg border border-border focus-within:border-accent/50 px-3 py-2 text-[12.5px] font-mono placeholder:text-soft resize-none outline-none leading-relaxed"
            />
          </div>

          {/* Tool Capabilities */}
          <div>
            <label className="block text-[11.5px] text-muted mb-1.5 font-medium">Tool Capabilities</label>
            <div className="flex flex-wrap gap-1.5">
              {TOOL_OPTIONS.map((tool) => {
                const active = selectedTools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggleTool(tool.id)}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] border transition-colors ${
                      active
                        ? 'bg-accent/20 border-accent/40 text-ink font-medium'
                        : 'bg-bg border-border text-muted hover:text-ink'
                    }`}
                  >
                    {tool.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Environments */}
          <div>
            <label className="block text-[11.5px] text-muted mb-1.5 font-medium">Fleet Environments</label>
            <div className="flex flex-wrap gap-1.5">
              {ENV_OPTIONS.map((env) => {
                const active = selectedEnvs.includes(env.id);
                return (
                  <button
                    key={env.id}
                    type="button"
                    onClick={() => toggleEnv(env.id)}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] border transition-colors ${
                      active
                        ? 'bg-accent/20 border-accent/40 text-ink font-medium'
                        : 'bg-bg border-border text-muted hover:text-ink'
                    }`}
                  >
                    {env.label}
                  </button>
                );
              })}
            </div>
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
