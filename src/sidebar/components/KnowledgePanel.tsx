import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  FileText,
  FolderPlus,
  Link,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createFolder,
  deleteDoc,
  deleteFolder,
  ingestDocument,
  listDocs,
  listFolders,
  type KnowledgeDoc,
  type KnowledgeFolder,
} from '../../services/rag';

interface Props {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  baseUrl?: string;
}

export default function KnowledgePanel({ open, onClose, apiKey, baseUrl }: Props) {
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestStep, setIngestStep] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');

  const refresh = useCallback(async () => {
    const f = await listFolders();
    setFolders(f);
    if (activeFolderId) {
      const d = await listDocs(activeFolderId);
      setDocs(d);
    }
  }, [activeFolderId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const f = await createFolder(newFolderName.trim());
    setNewFolderName('');
    setShowNewFolder(false);
    setActiveFolderId(f.id);
    await refresh();
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    if (activeFolderId === id) {
      setActiveFolderId(null);
      setDocs([]);
    }
    await refresh();
  };

  const handleDeleteDoc = async (docId: string) => {
    await deleteDoc(docId);
    await refresh();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !activeFolderId || !apiKey) return;
    setIngesting(true);
    for (const file of Array.from(files)) {
      try {
        setIngestStep(`Reading ${file.name}…`);
        const text = await file.text();
        await ingestDocument({
          folderId: activeFolderId,
          name: file.name,
          text,
          sourceType: 'file',
          apiKey,
          baseUrl,
          onProgress: (step) => setIngestStep(`${file.name}: ${step}…`),
        });
      } catch (e) {
        console.error('Ingest error:', e);
      }
    }
    setIngesting(false);
    setIngestStep('');
    await refresh();
  };

  const handleUrl = async () => {
    if (!urlValue.trim() || !activeFolderId || !apiKey) return;
    setIngesting(true);
    try {
      setIngestStep('Fetching URL…');
      const res = await fetch(`https://r.jina.ai/${urlValue.trim()}`);
      const text = await res.text();
      await ingestDocument({
        folderId: activeFolderId,
        name: urlValue.trim(),
        text,
        sourceType: 'url',
        apiKey,
        baseUrl,
        onProgress: (step) => setIngestStep(step),
      });
    } catch (e) {
      console.error('URL ingest error:', e);
    }
    setIngesting(false);
    setIngestStep('');
    setUrlValue('');
    setShowUrlInput(false);
    await refresh();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-bg animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-border bg-surface shrink-0">
        {activeFolder ? (
          <>
            <button
              onClick={() => {
                setActiveFolderId(null);
                setDocs([]);
              }}
              className="p-1 rounded-md text-muted hover:text-ink hover:bg-elevated"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[14px]">{activeFolder.emoji}</span>
            <span className="text-[14px] font-semibold truncate flex-1">{activeFolder.name}</span>
            <span className="text-[11px] text-muted">{docs.length} docs</span>
          </>
        ) : (
          <>
            <BookOpen size={16} className="text-accent" />
            <span className="text-[14px] font-semibold flex-1">Knowledge Base</span>
            <span className="text-[11px] text-muted">{folders.length} folders</span>
          </>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated ml-1"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!activeFolder ? (
          /* ── Folder List ── */
          <>
            {folders.map((f) => (
              <div
                key={f.id}
                className="group flex items-center gap-3 p-3 rounded-xl bg-surface border border-border hover:bg-elevated transition-colors cursor-pointer"
                onClick={() => {
                  setActiveFolderId(f.id);
                  listDocs(f.id)
                    .then(setDocs)
                    .catch((error) => {
                      console.debug('Failed to list docs:', error);
                      setDocs([]);
                    });
                }}
              >
                <span className="text-[18px]">{f.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{f.name}</div>
                  <div className="text-[11px] text-muted">
                    Created {new Date(f.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(f.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {folders.length === 0 && !showNewFolder && (
              <div className="text-center py-12 text-muted">
                <BookOpen size={32} className="mx-auto mb-3 opacity-40" />
                <div className="text-[13px]">No knowledge folders yet</div>
                <div className="text-[11.5px] mt-1">Create one to start adding documents</div>
              </div>
            )}

            {showNewFolder ? (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-surface border border-accent/40">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  placeholder="Folder name…"
                  className="flex-1 bg-transparent text-[13px] outline-none px-2 py-1"
                />
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="px-3 py-1 rounded-lg text-[12px] font-medium bg-accent text-bg disabled:opacity-40"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewFolder(false);
                    setNewFolderName('');
                  }}
                  className="p-1 rounded text-muted hover:text-ink"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewFolder(true)}
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-muted hover:text-ink hover:border-accent/50 transition-colors"
              >
                <FolderPlus size={14} />
                <span className="text-[13px]">New folder</span>
              </button>
            )}
          </>
        ) : (
          /* ── Document List ── */
          <>
            {docs.map((d) => (
              <div
                key={d.id}
                className="group flex items-center gap-3 p-3 rounded-xl bg-surface border border-border"
              >
                <FileText size={14} className="text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">{d.name}</div>
                  <div className="text-[11px] text-muted">
                    {d.chunkCount} chunks · {Math.round(d.charCount / 1000)}k chars ·{' '}
                    {d.sourceType}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteDoc(d.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border border-dashed border-border rounded-xl p-6 text-center text-muted hover:border-accent/50 transition-colors"
            >
              {ingesting ? (
                <div className="text-[12.5px]">
                  <div className="animate-pulse mb-1">⚙️ Processing…</div>
                  <div className="text-[11px] text-soft">{ingestStep}</div>
                </div>
              ) : (
                <>
                  <Upload size={20} className="mx-auto mb-2 opacity-40" />
                  <div className="text-[12.5px]">Drop files here or use buttons below</div>
                  <div className="text-[11px] text-soft mt-1">
                    .md, .txt, .json, .csv, .py, .ts, .go, .pdf
                  </div>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-[12.5px] text-muted hover:text-ink hover:bg-elevated cursor-pointer transition-colors">
                <Plus size={12} />
                Add files
                <input
                  type="file"
                  multiple
                  accept=".md,.txt,.json,.csv,.py,.ts,.js,.go,.rs,.tsx,.jsx,.html,.css,.yaml,.yml,.toml,.xml,.pdf"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                  disabled={ingesting}
                />
              </label>
              <button
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-[12.5px] text-muted hover:text-ink hover:bg-elevated transition-colors"
                disabled={ingesting}
              >
                <Link size={12} />
                Add URL
              </button>
            </div>

            {showUrlInput && (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrl()}
                  placeholder="https://example.com/page"
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-accent/50"
                />
                <button
                  onClick={handleUrl}
                  disabled={!urlValue.trim() || ingesting}
                  className="px-3 py-2 rounded-lg text-[12px] font-medium bg-accent text-bg disabled:opacity-40"
                >
                  Fetch
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
