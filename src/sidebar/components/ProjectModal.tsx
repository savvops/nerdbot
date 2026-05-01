import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronLeft,
  FileText,
  Link as LinkIcon,
  MessageSquare,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createFolder,
  deleteDoc,
  deleteFolder,
  getFolder,
  ingestDocument,
  knowledgeStats,
  listDocs,
  updateFolder,
  type KnowledgeDoc,
  type KnowledgeFolder,
} from '../../services/rag';
import { extractPdfText } from '../../services/attachments';
import { chatsInProject } from '../../services/chatManager';
import type { Chat } from '../../services/types';

const EMOJIS = ['📁', '🛠️', '📚', '🧪', '💼', '🎓', '🎨', '🧠', '💡', '🚀', '🔬', '📝', '🎯', '🏗️', '⚡'];

interface Props {
  open: boolean;
  /** When provided, edit this project. When null, create new. */
  projectId: string | null;
  history: Chat[];
  apiKey: string;
  baseUrl?: string;
  embeddingModel?: string;
  onClose: (created: { id: string } | null) => void;
  onOpenChat: (chatId: string) => void;
  onNewChatInProject: (projectId: string) => void;
  onProjectsChanged: () => void;
}

type Tab = 'files' | 'settings' | 'chats';

export default function ProjectModal({
  open,
  projectId,
  history,
  apiKey,
  baseUrl,
  embeddingModel,
  onClose,
  onOpenChat,
  onNewChatInProject,
  onProjectsChanged,
}: Props) {
  const isNew = !projectId;
  const [tab, setTab] = useState<Tab>(isNew ? 'settings' : 'files');
  const [folder, setFolder] = useState<KnowledgeFolder | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const [ingesting, setIngesting] = useState(false);
  const [ingestStep, setIngestStep] = useState('');
  const [ingestErrors, setIngestErrors] = useState<{ name: string; error: string }[]>([]);
  const [showUrl, setShowUrl] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [chunkCount, setChunkCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setDocs([]);
      return;
    }
    const f = await getFolder(projectId);
    setFolder(f);
    if (f) {
      setName(f.name);
      setEmoji(f.emoji);
      setDescription(f.description ?? '');
      setSystemPrompt(f.systemPrompt ?? '');
    }
    const d = await listDocs(projectId);
    setDocs(d);
    const stats = await knowledgeStats();
    setChunkCount(stats.chunks);
  }, [projectId]);

  useEffect(() => {
    if (open) {
      setIngestErrors([]);
      setShowUrl(false);
      setUrlValue('');
      setTab(isNew ? 'settings' : 'files');
      if (isNew) {
        setName('');
        setEmoji('📁');
        setDescription('');
        setSystemPrompt('');
        setFolder(null);
      } else {
        refresh();
      }
    }
  }, [open, isNew, refresh]);

  if (!open) return null;

  const projectChats = projectId ? chatsInProject(history, projectId) : [];

  const handleSaveSettings = async () => {
    if (!name.trim()) return;
    if (isNew) {
      const created = await createFolder(name.trim(), emoji, {
        description,
        systemPrompt,
      });
      onProjectsChanged();
      onClose({ id: created.id });
    } else if (projectId) {
      await updateFolder(projectId, { name, emoji, description, systemPrompt });
      onProjectsChanged();
      await refresh();
      setTab('files');
    }
  };

  const handleDeleteProject = async () => {
    if (!projectId) return;
    if (!confirm(`Delete project "${name}"? Chats inside it will be unlinked but not deleted.`)) return;
    await deleteFolder(projectId);
    onProjectsChanged();
    onClose(null);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !projectId) return;
    if (!apiKey) {
      setIngestErrors([{ name: '(all)', error: 'No Gemini API key. Open Settings.' }]);
      return;
    }
    setIngesting(true);
    setIngestErrors([]);
    for (const file of Array.from(files)) {
      try {
        setIngestStep(`Reading ${file.name}…`);
        let text = '';
        const isPdf =
          file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          text = await extractPdfText(file);
        } else {
          text = await file.text();
        }
        if (!text.trim()) {
          throw new Error('File is empty or could not be read.');
        }
        await ingestDocument({
          folderId: projectId,
          name: file.name,
          text,
          sourceType: 'file',
          apiKey,
          baseUrl,
          embeddingModel,
          onProgress: (step) => setIngestStep(`${file.name}: ${step}…`),
        });
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setIngestErrors((prev) => [...prev, { name: file.name, error: msg }]);
      }
    }
    setIngesting(false);
    setIngestStep('');
  };

  const handleUrl = async () => {
    if (!urlValue.trim() || !projectId) return;
    if (!apiKey) {
      setIngestErrors([{ name: urlValue, error: 'No Gemini API key. Open Settings.' }]);
      return;
    }
    setIngesting(true);
    setIngestErrors([]);
    try {
      setIngestStep('Fetching URL via Jina Reader…');
      const res = await fetch(`https://r.jina.ai/${urlValue.trim()}`);
      if (!res.ok) throw new Error(`Jina Reader: HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('URL returned empty content.');
      await ingestDocument({
        folderId: projectId,
        name: urlValue.trim(),
        text,
        sourceType: 'url',
        apiKey,
        baseUrl,
        embeddingModel,
        onProgress: (step) => setIngestStep(step),
      });
      await refresh();
      setUrlValue('');
      setShowUrl(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setIngestErrors([{ name: urlValue, error: msg }]);
    }
    setIngesting(false);
    setIngestStep('');
  };

  const handleDeleteDoc = async (id: string) => {
    await deleteDoc(id);
    await refresh();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center p-0 sm:p-3 bg-black/55 animate-fade-in">
      <div className="w-full sm:max-w-[440px] sm:rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden flex flex-col h-full sm:max-h-[90vh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
          {!isNew && (
            <button
              onClick={() => onClose(null)}
              className="p-1 rounded-md text-muted hover:text-ink hover:bg-elevated"
              title="Back"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <span className="text-[16px]">{emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold truncate">
              {isNew ? 'New project' : name || 'Project'}
            </div>
            {!isNew && (
              <div className="text-[11px] text-muted truncate">
                {docs.length} files · {projectChats.length} chats · {chunkCount} chunks
              </div>
            )}
          </div>
          <button
            onClick={() => onClose(null)}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs (existing project only) */}
        {!isNew && (
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-border shrink-0">
            <TabBtn label="Files" icon={FileText} active={tab === 'files'} onClick={() => setTab('files')} />
            <TabBtn label="Chats" icon={MessageSquare} active={tab === 'chats'} onClick={() => setTab('chats')} />
            <TabBtn label="Settings" icon={SettingsIcon} active={tab === 'settings'} onClick={() => setTab('settings')} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'settings' && (
            <SettingsTab
              isNew={isNew}
              name={name}
              setName={setName}
              emoji={emoji}
              setEmoji={setEmoji}
              description={description}
              setDescription={setDescription}
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
              onDelete={isNew ? null : handleDeleteProject}
            />
          )}

          {tab === 'files' && (
            <FilesTab
              docs={docs}
              ingesting={ingesting}
              ingestStep={ingestStep}
              ingestErrors={ingestErrors}
              showUrl={showUrl}
              setShowUrl={setShowUrl}
              urlValue={urlValue}
              setUrlValue={setUrlValue}
              onFiles={handleFiles}
              onUrl={handleUrl}
              onDeleteDoc={handleDeleteDoc}
            />
          )}

          {tab === 'chats' && projectId && (
            <ChatsTab
              chats={projectChats}
              onOpen={(id) => {
                onOpenChat(id);
                onClose(null);
              }}
              onNew={() => {
                onNewChatInProject(projectId);
                onClose(null);
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-bg flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={() => onClose(null)}
            className="px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated"
          >
            {tab === 'settings' && (isNew || name !== folder?.name) ? 'Cancel' : 'Close'}
          </button>
          {tab === 'settings' && (
            <button
              onClick={handleSaveSettings}
              disabled={!name.trim()}
              className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                name.trim()
                  ? 'bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20'
                  : 'bg-elevated text-soft cursor-not-allowed'
              }`}
            >
              {isNew ? 'Create project' : 'Save'}
            </button>
          )}
          {tab !== 'settings' && projectId && (
            <button
              onClick={() => {
                onNewChatInProject(projectId);
                onClose(null);
              }}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20 flex items-center gap-1.5"
            >
              <Plus size={12} /> Chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 -mb-px text-[12.5px] flex items-center gap-1.5 border-b-2 transition-colors ${
        active
          ? 'border-accent text-ink'
          : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

/* ── Settings tab ───────────────────────────────────── */
function SettingsTab({
  isNew,
  name,
  setName,
  emoji,
  setEmoji,
  description,
  setDescription,
  systemPrompt,
  setSystemPrompt,
  onDelete,
}: {
  isNew: boolean;
  name: string;
  setName: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  systemPrompt: string;
  setSystemPrompt: (v: string) => void;
  onDelete: (() => void) | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11.5px] text-muted mb-1.5 font-medium">Name</label>
        <div className="flex items-center gap-2 bg-bg rounded-lg border border-border focus-within:border-accent/50 px-2.5">
          <select
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="bg-transparent text-[16px] py-2 cursor-pointer outline-none"
          >
            {EMOJIS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Thesis research, Side project"
            className="flex-1 bg-transparent py-2 text-[13.5px] placeholder:text-soft outline-none"
            autoFocus={isNew}
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
          placeholder="What is this project about?"
          className="w-full bg-bg rounded-lg border border-border focus-within:border-accent/50 px-3 py-2 text-[13px] placeholder:text-soft outline-none"
        />
      </div>

      <div>
        <label className="block text-[11.5px] text-muted mb-1.5 font-medium">
          Custom instructions <span className="text-soft">(optional)</span>
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={5}
          placeholder={`How should Nerdbot behave inside this project?\nExample: "You are a senior research assistant. Always cite the uploaded papers by filename."`}
          className="w-full bg-bg rounded-lg border border-border focus-within:border-accent/50 px-3 py-2 text-[13px] placeholder:text-soft resize-none outline-none leading-relaxed"
        />
        <div className="text-[10.5px] text-soft mt-1">
          Prepended to every chat in this project. Files in this project are auto-injected via RAG.
        </div>
      </div>

      {onDelete && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={onDelete}
            className="text-[12px] text-danger hover:underline flex items-center gap-1"
          >
            <Trash2 size={11} /> Delete project
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Files tab ──────────────────────────────────────── */
function FilesTab({
  docs,
  ingesting,
  ingestStep,
  ingestErrors,
  showUrl,
  setShowUrl,
  urlValue,
  setUrlValue,
  onFiles,
  onUrl,
  onDeleteDoc,
}: {
  docs: KnowledgeDoc[];
  ingesting: boolean;
  ingestStep: string;
  ingestErrors: { name: string; error: string }[];
  showUrl: boolean;
  setShowUrl: (v: boolean) => void;
  urlValue: string;
  setUrlValue: (v: string) => void;
  onFiles: (files: FileList | null) => void;
  onUrl: () => void;
  onDeleteDoc: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <div
          key={d.id}
          className="group flex items-center gap-3 p-2.5 rounded-xl bg-bg border border-border"
        >
          <FileText size={13} className="text-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] truncate">{d.name}</div>
            <div className="text-[10.5px] text-muted">
              {d.chunkCount} chunks · {Math.round(d.charCount / 1000)}k chars · {d.sourceType}
            </div>
          </div>
          <button
            onClick={() => onDeleteDoc(d.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
        className="border border-dashed border-border rounded-xl p-5 text-center text-muted hover:border-accent/50 transition-colors"
      >
        {ingesting ? (
          <div className="text-[12.5px]">
            <div className="animate-pulse mb-1">⚙️ Processing…</div>
            <div className="text-[11px] text-soft">{ingestStep}</div>
          </div>
        ) : (
          <>
            <Upload size={18} className="mx-auto mb-1.5 opacity-50" />
            <div className="text-[12px]">Drop files or use buttons below</div>
            <div className="text-[10.5px] text-soft mt-0.5">
              .md .txt .pdf .json .csv .py .ts .js .html …
            </div>
          </>
        )}
      </div>

      {/* Errors */}
      {ingestErrors.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-2.5 space-y-1">
          {ingestErrors.map((e, i) => (
            <div key={i} className="text-[11.5px] text-ink">
              <span className="font-medium text-danger">✗ {e.name}:</span>{' '}
              <span className="text-muted">{e.error}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-bg border border-border text-[12px] text-muted hover:text-ink hover:bg-elevated cursor-pointer transition-colors">
          <Plus size={12} />
          Add files
          <input
            type="file"
            multiple
            accept=".md,.txt,.json,.csv,.py,.ts,.js,.go,.rs,.tsx,.jsx,.html,.css,.yaml,.yml,.toml,.xml,.pdf"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
            disabled={ingesting}
          />
        </label>
        <button
          onClick={() => setShowUrl(!showUrl)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg border border-border text-[12px] text-muted hover:text-ink hover:bg-elevated"
          disabled={ingesting}
        >
          <LinkIcon size={12} />
          URL
        </button>
      </div>

      {showUrl && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onUrl()}
            placeholder="https://example.com/page"
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-[12.5px] outline-none focus:border-accent/50"
          />
          <button
            onClick={onUrl}
            disabled={!urlValue.trim() || ingesting}
            className="px-3 py-2 rounded-lg text-[12px] font-medium bg-accent text-bg disabled:opacity-40"
          >
            Fetch
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Chats tab ──────────────────────────────────────── */
function ChatsTab({
  chats,
  onOpen,
  onNew,
}: {
  chats: Chat[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {chats.length === 0 && (
        <div className="text-center py-10 text-muted">
          <MessageSquare size={24} className="mx-auto mb-2 opacity-40" />
          <div className="text-[12.5px]">No chats yet in this project.</div>
          <div className="text-[11px] mt-1">Start one — files in this project are auto-used as context.</div>
        </div>
      )}
      {chats.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c.id)}
          className="w-full flex items-start gap-2.5 p-2.5 rounded-xl bg-bg hover:bg-elevated border border-border transition-colors text-left"
        >
          <MessageSquare size={12} className="mt-1 text-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] truncate">{c.title}</div>
            <div className="text-[11px] text-muted">
              {c.messages.length} msgs · {new Date(c.updatedAt).toLocaleDateString()}
            </div>
          </div>
        </button>
      ))}
      <button
        onClick={onNew}
        className="w-full flex items-center justify-center gap-2 py-2 mt-2 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-ink text-[13px]"
      >
        <Plus size={14} /> New chat in project
      </button>
    </div>
  );
}
