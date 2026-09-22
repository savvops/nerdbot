import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  FileCode,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Skill } from '../../services/types';
import {
  BUILTIN_SKILLS,
  exportAllSkillsAsJson,
  exportSkillAsJson,
  exportSkillAsMarkdown,
  importSkillsBundle,
} from '../../services/skills';

interface Props {
  open: boolean;
  skills: Skill[];
  onClose: () => void;
  onPick: (s: Skill) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onEdit: (s: Skill) => void;
  onReset: (id: string) => void;
  onSkillsReload?: () => Promise<void>;
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
  onSkillsReload,
}: Props) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!open) return null;
  const builtin = skills.filter((s) => s.builtin);
  const custom = skills.filter((s) => !s.builtin);

  // Detect which built-in skills have been overridden
  const overriddenIds = new Set<string>();
  for (const s of builtin) {
    const orig = BUILTIN_SKILLS.find((b) => b.id === s.id);
    if (
      orig &&
      (orig.name !== s.name ||
        orig.instructions !== s.instructions ||
        orig.description !== s.description ||
        orig.emoji !== s.emoji)
    ) {
      overriddenIds.add(s.id);
    }
  }

  const handleExportAll = async () => {
    const json = await exportAllSkillsAsJson();
    // Copy to clipboard
    await navigator.clipboard.writeText(json);
    // Trigger download
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nerdbot-skills-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopySkill = async (s: Skill, format: 'md' | 'json') => {
    const content = format === 'md' ? exportSkillAsMarkdown(s) : exportSkillAsJson(s);
    await navigator.clipboard.writeText(content);
    setCopiedId(`${s.id}-${format}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDoImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const res = await importSkillsBundle(importText);
      if (res.imported > 0) {
        setImportStatus(`Successfully imported ${res.imported} skill(s)!`);
        setImportText('');
        if (onSkillsReload) await onSkillsReload();
        setTimeout(() => {
          setShowImport(false);
          setImportStatus(null);
        }, 1500);
      } else {
        setImportStatus(`Import failed: ${res.errors.join(', ')}`);
      }
    } catch (e: any) {
      setImportStatus(`Error: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[420px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">Shared Skills Hub</div>
            <div className="text-[11px] text-muted">
              {skills.length} skills • Universal schema for Nerdbot, Master Control & SAO
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        {/* Action Header */}
        <div className="px-3 py-2 border-b border-border/70 bg-bg/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowImport(!showImport)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] border transition-colors ${
                showImport
                  ? 'bg-accent/20 border-accent/40 text-ink'
                  : 'bg-surface border-border text-muted hover:text-ink'
              }`}
            >
              <Upload size={12} />
              Import
            </button>
            <button
              onClick={handleExportAll}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] bg-surface border border-border text-muted hover:text-ink transition-colors"
              title="Download all skills as JSON and copy to clipboard"
            >
              <Download size={12} />
              {copiedId === 'all' ? 'Downloaded & Copied!' : 'Export All'}
            </button>
          </div>
          <span className="text-[10px] text-soft">Universal SKILL.md format</span>
        </div>

        {/* Import Panel */}
        {showImport && (
          <div className="p-3 bg-bg border-b border-border space-y-2.5 animate-slide-down">
            <div className="text-[11.5px] text-muted flex items-center justify-between">
              <span>Paste Skill JSON or Markdown (YAML Frontmatter):</span>
              <button
                onClick={() => setShowImport(false)}
                className="text-[10.5px] text-soft hover:text-ink"
              >
                Cancel
              </button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`---
name: "My Universal Skill"
emoji: "⚡"
description: "Cross-system automation"
tools: ["browser"]
environments: ["nerdbot", "master_control", "sao"]
---
Instructions here...`}
              className="w-full h-24 p-2 bg-surface border border-border rounded-lg text-[11px] font-mono outline-none resize-none focus:border-accent/50"
            />
            {importStatus && (
              <div
                className={`text-[11px] ${
                  importStatus.includes('Successfully') ? 'text-green-400' : 'text-danger'
                }`}
              >
                {importStatus}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={handleDoImport}
                disabled={!importText.trim() || importing}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent/90 disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import Skill'}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto p-3 space-y-4 flex-1">
          <Section
            title="Built-in Skills"
            items={builtin}
            onPick={onPick}
            onEdit={onEdit}
            onCopy={handleCopySkill}
            copiedId={copiedId}
            overriddenIds={overriddenIds}
            onReset={onReset}
          />
          <Section
            title="Custom & Shared Skills"
            items={custom}
            onPick={onPick}
            onEdit={onEdit}
            onCopy={handleCopySkill}
            copiedId={copiedId}
            onDelete={onDelete}
            empty="No custom skills yet. Create one or import from Master Control/SAO!"
          />
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-bg">
          <span className="text-[11px] text-muted">Portable across your agent fleet</span>
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
  onCopy,
  copiedId,
  overriddenIds,
  empty,
}: {
  title: string;
  items: Skill[];
  onPick: (s: Skill) => void;
  onEdit: (s: Skill) => void;
  onCopy: (s: Skill, format: 'md' | 'json') => void;
  copiedId: string | null;
  onDelete?: (id: string) => void;
  onReset?: (id: string) => void;
  overriddenIds?: Set<string>;
  empty?: string;
}) {
  return (
    <div>
      <div className="px-1 pb-1.5 text-[11px] uppercase tracking-wide text-muted font-medium flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[10px] text-soft">{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && empty && (
          <div className="px-3 py-3 text-[12.5px] text-muted bg-bg/50 rounded-xl border border-dashed border-border/70 text-center">
            {empty}
          </div>
        )}
        {items.map((s) => {
          const isOverridden = overriddenIds?.has(s.id);
          const hasBrowser = s.tools?.includes('browser') || s.id === 'builtin-browse';
          const hasCli = s.tools?.includes('cli') || s.id === 'builtin-cli-replay';

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
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
                      edited
                    </span>
                  )}
                  {hasBrowser && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">
                      browser
                    </span>
                  )}
                  {hasCli && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                      cli
                    </span>
                  )}
                </div>
                {s.description && (
                  <div className="text-[11.5px] text-muted truncate mt-0.5">
                    {s.description}
                  </div>
                )}
              </button>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Share/Export button */}
                <div className="relative flex items-center">
                  <button
                    onClick={() => onCopy(s, 'md')}
                    className="p-1 rounded text-muted hover:text-accent hover:bg-surface"
                    title={copiedId === `${s.id}-md` ? 'Copied Markdown!' : 'Copy Markdown (SKILL.md)'}
                  >
                    {copiedId === `${s.id}-md` ? <Check size={12} className="text-accent" /> : <FileCode size={12} />}
                  </button>
                  <button
                    onClick={() => onCopy(s, 'json')}
                    className="p-1 rounded text-muted hover:text-accent hover:bg-surface"
                    title={copiedId === `${s.id}-json` ? 'Copied JSON!' : 'Copy JSON'}
                  >
                    {copiedId === `${s.id}-json` ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                  </button>
                </div>

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
