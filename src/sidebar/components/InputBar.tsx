import { ArrowUp, BookOpen, Globe, Image as ImageIcon, Paperclip, Square, Plus, KeyRound, Shield } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Attachment, PageContext, Skill, SpeedMode } from '../../services/types';
import { listCredentials, type CredentialItem } from '../../services/credentials';
import PageSharePill from './PageSharePill';
import SpeedToggle from './SpeedToggle';
import SkillsMenu from './SkillsMenu';
import AttachmentPreview from './AttachmentPreview';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  page: PageContext | null;
  shareEnabled: boolean;
  onToggleShare: () => void;
  extraTabCount: number;
  speed: SpeedMode;
  onSpeedChange: (s: SpeedMode) => void;
  skills: Skill[];
  activeSkill: Skill | null;
  onPickSkill: (s: Skill | null) => void;
  onAddSkill: () => void;
  onBrowseSkills: () => void;

  attachments: Attachment[];
  onAttach: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  visionCapable: boolean;

  webSearch: boolean;
  onToggleSearch: () => void;
  searchCapable: boolean;

  onMultiTabClick: () => void;

  knowledgeEnabled: boolean;
  onToggleKnowledge: () => void;
  onOpenKnowledge: () => void;
  knowledgeCount: number;

  tokensIn: number;
  costHint: string;
  onOpenVault?: () => void;
}

export default function InputBar(props: Props) {
  const {
    value,
    onChange,
    onSubmit,
    onCancel,
    busy,
    onOpenVault,
    page,
    shareEnabled,
    onToggleShare,
    extraTabCount,
    speed,
    onSpeedChange,
    skills,
    activeSkill,
    onPickSkill,
    onAddSkill,
    onBrowseSkills,
    attachments,
    onAttach,
    onRemoveAttachment,
    visionCapable,
    webSearch,
    onToggleSearch,
    searchCapable,
    onMultiTabClick,
    knowledgeEnabled,
    onToggleKnowledge,
    onOpenKnowledge,
    knowledgeCount,
    tokensIn,
    costHint,
  } = props;

  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultItems, setVaultItems] = useState<CredentialItem[]>([]);
  const vaultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vaultOpen) return;
    listCredentials().then(setVaultItems).catch(() => {});
    const handleClickOutside = (e: MouseEvent) => {
      if (vaultRef.current && !vaultRef.current.contains(e.target as Node)) {
        setVaultOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [vaultOpen]);

  const handleInsertSecret = (keyName: string) => {
    const placeholder = `$SECRET{${keyName}}`;
    const ta = ref.current;
    if (!ta) {
      onChange(value ? `${value} ${placeholder}` : placeholder);
    } else {
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const next = value.slice(0, start) + placeholder + value.slice(end);
      onChange(next);
      setTimeout(() => {
        ta.focus();
        const pos = start + placeholder.length;
        ta.setSelectionRange(pos, pos);
      }, 0);
    }
    setVaultOpen(false);
  };

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [value]);

  useEffect(() => {
    if (value.startsWith('/')) setSkillsOpen(true);
    else setSkillsOpen(false);
  }, [value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !skillsOpen) {
      e.preventDefault();
      if (!busy && (value.trim() || activeSkill || attachments.length > 0)) onSubmit();
    }
  };

  const handlePickSkill = (s: Skill) => {
    onPickSkill(s);
    onChange('');
    setSkillsOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          onAttach(file);
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach(onAttach);
  };

  const sendDisabled = busy || (!value.trim() && !activeSkill && attachments.length === 0);

  return (
    <div
      className={`px-3 pb-3 pt-1 bg-bg border-t border-border/60 relative ${
        dragOver ? 'ring-2 ring-accent/60 rounded-t-xl' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <SkillsMenu
        open={skillsOpen}
        query={value}
        skills={skills}
        onPick={handlePickSkill}
        onAddSkill={() => {
          setSkillsOpen(false);
          onAddSkill();
        }}
        onBrowse={() => {
          setSkillsOpen(false);
          onBrowseSkills();
        }}
        onClose={() => setSkillsOpen(false)}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach(onAttach);
          e.target.value = '';
        }}
      />

      {/* Top context row */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap min-h-[24px]">
        {activeSkill && (
          <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-[11.5px] bg-accent/15 border border-accent/40 text-ink">
            <span>{activeSkill.emoji}</span>
            <span className="max-w-[140px] truncate">{activeSkill.name}</span>
            <button
              onClick={() => onPickSkill(null)}
              className="ml-0.5 grid place-items-center w-4 h-4 rounded-full hover:bg-accent/25 text-muted hover:text-ink"
              title="Remove skill"
            >
              ×
            </button>
          </span>
        )}
        <PageSharePill
          page={page}
          enabled={shareEnabled}
          onToggle={onToggleShare}
          extraTabCount={extraTabCount}
        />
        <button
          onClick={onMultiTabClick}
          className={`inline-flex items-center gap-1 pl-2 pr-2 py-1 rounded-full text-[11.5px] border transition-colors ${
            extraTabCount > 0
              ? 'bg-accent/15 border-accent/40 text-ink'
              : 'bg-surface border-border text-muted hover:text-ink'
          }`}
          title={extraTabCount > 0 ? `${extraTabCount} extra shared tab${extraTabCount === 1 ? '' : 's'}` : 'Add another tab'}
        >
          <Plus size={11} className={extraTabCount > 0 ? 'text-accent' : ''} />
          {extraTabCount > 0 ? `${extraTabCount} tab${extraTabCount === 1 ? '' : 's'}` : 'tab'}
        </button>
        {searchCapable && (
          <button
            onClick={onToggleSearch}
            className={`inline-flex items-center gap-1 pl-2 pr-2 py-1 rounded-full text-[11.5px] border transition-colors ${
              webSearch
                ? 'bg-accent/15 border-accent/40 text-ink'
                : 'bg-surface border-border text-muted hover:text-ink'
            }`}
            title={webSearch ? 'Web search on' : 'Enable web search'}
          >
            <Globe size={11} className={webSearch ? 'text-accent' : ''} /> Search
          </button>
        )}
        <button
          onClick={knowledgeCount > 0 ? onToggleKnowledge : onOpenKnowledge}
          className={`inline-flex items-center gap-1 pl-2 pr-2 py-1 rounded-full text-[11.5px] border transition-colors ${
            knowledgeEnabled
              ? 'bg-accent/15 border-accent/40 text-ink'
              : 'bg-surface border-border text-muted hover:text-ink'
          }`}
          title={knowledgeEnabled ? 'RAG knowledge active' : 'Enable knowledge context'}
        >
          <BookOpen size={11} className={knowledgeEnabled ? 'text-accent' : ''} />
          {knowledgeCount > 0 ? `KB · ${knowledgeCount}` : 'KB'}
        </button>
      </div>

      <AttachmentPreview attachments={attachments} onRemove={onRemoveAttachment} />

      {/* Composer */}
      <div className="rounded-2xl bg-surface border border-border focus-within:border-accent/50 focus-within:bg-elevated/40 transition-colors">
        <div className="flex items-end gap-0.5 px-1.5 pt-2 pb-1.5">
          <button
            className="grid place-items-center w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-elevated transition-colors disabled:opacity-40"
            title={visionCapable ? 'Attach image or PDF' : 'Switch to a vision-capable provider'}
            onClick={() => fileRef.current?.click()}
            disabled={!visionCapable}
          >
            <Paperclip size={16} />
          </button>
          <div className="relative" ref={vaultRef}>
            <button
              type="button"
              onClick={() => setVaultOpen((v) => !v)}
              className="grid place-items-center w-8 h-8 rounded-full text-muted hover:text-ink hover:bg-elevated transition-colors"
              title="Insert secret from Credentials Vault ($SECRET{...})"
            >
              <KeyRound size={15} />
            </button>

            {vaultOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 p-2.5 rounded-xl bg-surface border border-border shadow-2xl z-50 text-xs space-y-2 animate-fade-in">
                <div className="flex items-center justify-between pb-1.5 border-b border-border text-[11.5px] font-semibold text-ink">
                  <span className="flex items-center gap-1.5">
                    <Shield size={13} className="text-emerald-400" />
                    <span>Insert Secret</span>
                  </span>
                  {onOpenVault && (
                    <button
                      type="button"
                      onClick={() => {
                        setVaultOpen(false);
                        onOpenVault();
                      }}
                      className="text-[10.5px] text-accent hover:underline font-normal"
                    >
                      Manage Vault
                    </button>
                  )}
                </div>

                {vaultItems.length === 0 ? (
                  <div className="p-3 text-center text-muted text-[11px] space-y-2">
                    <div>No secrets stored in vault yet.</div>
                    {onOpenVault && (
                      <button
                        type="button"
                        onClick={() => {
                          setVaultOpen(false);
                          onOpenVault();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-accent text-white font-medium hover:brightness-110"
                      >
                        Add first secret
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {vaultItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleInsertSecret(item.key)}
                        className="w-full text-left p-1.5 rounded-lg hover:bg-elevated text-ink flex flex-col gap-0.5 transition-colors group"
                      >
                        <span className="font-mono font-semibold text-[11.5px] text-ink group-hover:text-accent truncate">
                          {item.key}
                        </span>
                        {item.description && (
                          <span className="text-[10px] text-muted truncate">
                            {item.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            placeholder={
              activeSkill
                ? `Use “${activeSkill.name}” on…`
                : 'Type / for skills · paste images · ask anything'
            }
            rows={1}
            className="flex-1 resize-none bg-transparent text-[14px] leading-snug placeholder:text-soft py-1.5 px-1 max-h-[200px]"
          />
          <button
            onClick={busy ? onCancel : onSubmit}
            disabled={!busy && sendDisabled}
            className={`grid place-items-center w-8 h-8 rounded-full transition-all ${
              busy
                ? 'bg-elevated text-ink hover:bg-border'
                : sendDisabled
                  ? 'bg-elevated text-soft cursor-not-allowed'
                  : 'bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20'
            }`}
            title={busy ? 'Stop' : 'Send'}
          >
            {busy ? <Square size={12} fill="currentColor" /> : <ArrowUp size={16} />}
          </button>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-0.5 gap-2">
          <SpeedToggle speed={speed} onChange={onSpeedChange} />
          <span className="text-[10.5px] text-soft inline-flex items-center gap-2 truncate">
            {tokensIn > 0 && (
              <span title="Approximate input tokens · cost estimate">
                ~{tokensIn.toLocaleString()} tok · {costHint}
              </span>
            )}
            <span className="hidden sm:inline">
              <kbd className="px-1 py-0.5 rounded border border-border text-soft">↵</kbd> send
            </span>
          </span>
        </div>
      </div>

      {dragOver && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none rounded-t-xl bg-accent/10 border-2 border-dashed border-accent text-accent text-sm font-medium">
          <span className="flex items-center gap-2">
            <ImageIcon size={16} /> Drop image or PDF
          </span>
        </div>
      )}
    </div>
  );
}
