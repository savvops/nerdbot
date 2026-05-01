import {
  ChevronRight,
  Download,
  FolderPlus,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import type { Chat } from '../../services/types';
import type { PinnedNote } from '../../services/chatManager';
import { chatsInProject, looseChats } from '../../services/chatManager';
import type { KnowledgeFolder } from '../../services/rag';
import BrandMark from './BrandMark';

interface Props {
  open: boolean;
  history: Chat[];
  pinned: PinnedNote[];
  projects: KnowledgeFolder[];
  currentId: string;
  activeProjectId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onNewChatInProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
  onUnpin: (id: string) => void;
  onExport: () => void;
}

function relative(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function HistoryDrawer({
  open,
  history,
  pinned,
  projects,
  currentId,
  activeProjectId,
  onClose,
  onNewChat,
  onNewProject,
  onOpenProject,
  onNewChatInProject,
  onDeleteProject,
  onPick,
  onDelete,
  onUnpin,
  onExport,
}: Props) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'recent' | 'projects' | 'pinned'>('recent');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(activeProjectId ? [activeProjectId] : [])
  );

  // Recent = loose chats only (project chats live under their project)
  const loose = useMemo(() => looseChats(history), [history]);

  const fuse = useMemo(
    () =>
      new Fuse(loose, {
        keys: ['title', 'messages.content'],
        threshold: 0.4,
      }),
    [loose]
  );
  const filteredRecent = useMemo(() => {
    if (!query.trim()) return loose;
    return fuse.search(query.trim()).map((r) => r.item);
  }, [fuse, query, loose]);

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed top-0 left-0 h-full w-[300px] z-50 bg-surface border-r border-border shadow-2xl transition-transform duration-200 flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
          <BrandMark size={20} />
          <span className="text-[13px] font-semibold flex-1">Nerdbot</span>
          <button
            onClick={onExport}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
            title="Export current chat to markdown"
          >
            <Download size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-3 shrink-0 grid grid-cols-2 gap-1.5">
          <button
            onClick={onNewChat}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-ink text-[12.5px] transition-colors"
            title="New regular chat"
          >
            <Plus size={12} /> Chat
          </button>
          <button
            onClick={onNewProject}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-bg hover:bg-elevated border border-border text-ink text-[12.5px] transition-colors"
            title="New project (folder + KB)"
          >
            <FolderPlus size={12} /> Project
          </button>
        </div>

        {tab === 'recent' && (
          <div className="px-3 mb-2 shrink-0">
            <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-2.5 py-1.5 focus-within:border-accent/50">
              <Search size={12} className="text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="flex-1 text-[12.5px] bg-transparent outline-none placeholder:text-soft"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 px-3 mb-1 shrink-0 text-[11px] uppercase tracking-wide font-medium">
          <TabPill label="Recent" active={tab === 'recent'} onClick={() => setTab('recent')} />
          <TabPill
            label={`Projects (${projects.length})`}
            active={tab === 'projects'}
            onClick={() => setTab('projects')}
          />
          <TabPill
            label={`Pinned (${pinned.length})`}
            active={tab === 'pinned'}
            onClick={() => setTab('pinned')}
          />
        </div>

        <div className="px-1.5 pb-3 overflow-y-auto flex-1">
          {tab === 'recent' && (
            <>
              {filteredRecent.length === 0 && (
                <div className="px-3 py-6 text-center text-[12.5px] text-muted">
                  {query ? 'No matches.' : 'Loose chats appear here. Project chats are under Projects.'}
                </div>
              )}
              {filteredRecent.map((c) => (
                <ChatRow
                  key={c.id}
                  chat={c}
                  current={c.id === currentId}
                  onPick={onPick}
                  onDelete={onDelete}
                />
              ))}
            </>
          )}

          {tab === 'projects' && (
            <>
              {projects.length === 0 && (
                <div className="px-3 py-6 text-center text-[12.5px] text-muted">
                  <div>No projects yet.</div>
                  <button
                    onClick={onNewProject}
                    className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-ink text-[12px]"
                  >
                    <FolderPlus size={11} /> Create your first project
                  </button>
                </div>
              )}
              {projects.map((p) => {
                const expanded = expandedProjects.has(p.id);
                const projChats = chatsInProject(history, p.id);
                const isActive = activeProjectId === p.id;
                return (
                  <div key={p.id} className="mb-1">
                    <div
                      className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        isActive ? 'bg-accent/10' : 'hover:bg-elevated/60'
                      }`}
                    >
                      <button
                        onClick={() => toggleProject(p.id)}
                        className="grid place-items-center w-4 h-4 text-muted hover:text-ink"
                      >
                        <ChevronRight
                          size={11}
                          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                        />
                      </button>
                      <span className="text-[14px]">{p.emoji}</span>
                      <button
                        onClick={() => toggleProject(p.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="text-[12.5px] truncate text-ink flex items-center gap-1.5">
                          {p.name}
                          {isActive && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
                              active
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-muted">
                          {projChats.length} chat{projChats.length === 1 ? '' : 's'}
                        </div>
                      </button>
                      <button
                        onClick={() => onOpenProject(p.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-ink hover:bg-surface"
                        title="Project settings & files"
                      >
                        <SettingsIcon size={11} />
                      </button>
                      <button
                        onClick={() => onNewChatInProject(p.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-accent hover:bg-surface"
                        title="New chat in project"
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete project "${p.name}"? Files and chats inside it will be removed.`)) {
                            onDeleteProject(p.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger hover:bg-surface"
                        title="Delete project"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {expanded && (
                      <div className="ml-4 pl-2 border-l border-border my-1 space-y-0.5">
                        {projChats.length === 0 && (
                          <button
                            onClick={() => onNewChatInProject(p.id)}
                            className="block w-full text-left px-2.5 py-1.5 text-[11.5px] text-muted hover:text-ink rounded-md"
                          >
                            + Start a chat in this project
                          </button>
                        )}
                        {projChats.map((c) => (
                          <ChatRow
                            key={c.id}
                            chat={c}
                            current={c.id === currentId}
                            compact
                            onPick={onPick}
                            onDelete={onDelete}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'pinned' && (
            <>
              {pinned.length === 0 && (
                <div className="px-3 py-6 text-center text-[12.5px] text-muted">
                  Pin useful answers to keep them here.
                </div>
              )}
              {pinned.map((p) => (
                <div
                  key={p.id}
                  className="group px-2.5 py-2 rounded-lg hover:bg-elevated/60 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Pin size={11} className="mt-1 text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] line-clamp-3 text-ink leading-snug">
                        {p.content}
                      </div>
                      <div className="text-[10.5px] text-muted mt-1">
                        from “{p.chatTitle}” · {relative(p.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => onUnpin(p.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger"
                      title="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-md transition-colors ${
        active ? 'text-ink bg-elevated' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function ChatRow({
  chat,
  current,
  compact,
  onPick,
  onDelete,
}: {
  chat: Chat;
  current: boolean;
  compact?: boolean;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={`group flex items-start gap-2 px-2.5 py-${compact ? '1.5' : '2'} rounded-lg cursor-pointer transition-colors ${
        current ? 'bg-elevated' : 'hover:bg-elevated/60'
      }`}
      onClick={() => onPick(chat.id)}
    >
      <MessageSquare size={compact ? 11 : 13} className="mt-1 text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={`${compact ? 'text-[12px]' : 'text-[13px]'} truncate text-ink`}>
          {chat.title}
        </div>
        <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-muted`}>
          {relative(chat.updatedAt)} · {chat.messages.length} msgs
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(chat.id);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-danger"
        title="Delete"
      >
        <Trash2 size={compact ? 10 : 12} />
      </button>
    </div>
  );
}
