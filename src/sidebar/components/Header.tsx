import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Cloud,
  CloudOff,
  Menu,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import BrandMark from './BrandMark';
import type { CloudAccountInfo } from '../../services/types';

interface Props {
  title: string;
  hasMessages: boolean;
  onToggleDrawer: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenSettingsTab?: (tab: 'connections' | 'vault' | 'models' | 'personas') => void;
  onClose?: () => void;
  onCaptureScreenshot: () => void;
  visionCapable: boolean;
  /** Optional active project chip — clicking it opens the project. */
  activeProject?: { name: string; emoji: string } | null;
  onOpenActiveProject?: () => void;
  cloudAccount?: CloudAccountInfo;
}

export default function Header({
  title,
  hasMessages,
  onToggleDrawer,
  onNewChat,
  onOpenSettings,
  onOpenSettingsTab,
  onClose,
  onCaptureScreenshot,
  visionCapable,
  activeProject,
  onOpenActiveProject,
  cloudAccount,
}: Props) {
  const [cloudMenuOpen, setCloudMenuOpen] = useState(false);
  const cloudMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cloudMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cloudMenuRef.current && !cloudMenuRef.current.contains(e.target as Node)) {
        setCloudMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [cloudMenuOpen]);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 px-3 h-12 border-b border-border bg-bg/85 backdrop-blur-md">
      <button
        onClick={onToggleDrawer}
        title="History"
        className="p-2 rounded-lg text-muted hover:text-ink hover:bg-elevated transition-colors"
      >
        <Menu size={16} />
      </button>

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <BrandMark size={20} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-none truncate">
            {hasMessages ? title : 'Nerdbot'}
          </div>
          {activeProject ? (
            <button
              onClick={onOpenActiveProject}
              className="inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline leading-tight mt-0.5"
              title="Open project"
            >
              <span>{activeProject.emoji}</span>
              <span className="truncate max-w-[160px]">{activeProject.name}</span>
            </button>
          ) : !hasMessages ? (
            <div className="text-[10.5px] text-muted leading-tight mt-0.5">
              Your browser-side AI
            </div>
          ) : null}
        </div>
      </div>

      <button
        onClick={onNewChat}
        title="New chat"
        className="p-2 rounded-lg text-muted hover:text-ink hover:bg-elevated transition-colors"
      >
        <Plus size={16} />
      </button>

      <button
        onClick={onCaptureScreenshot}
        disabled={!visionCapable}
        title={visionCapable ? 'Screenshot active tab' : 'Switch to a vision-capable provider'}
        className="p-2 rounded-lg text-muted hover:text-ink hover:bg-elevated transition-colors disabled:opacity-40"
      >
        <Camera size={16} />
      </button>

      {cloudAccount && (
        <div className="relative" ref={cloudMenuRef}>
          {cloudAccount.user ? (
            <button
              onClick={() => setCloudMenuOpen((v) => !v)}
              title={`${cloudAccount.user.email} · ${cloudAccount.status.message}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-surface hover:bg-elevated border border-border text-muted hover:text-ink transition-colors"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  cloudAccount.status.error
                    ? 'bg-danger'
                    : (cloudAccount.status.pending ?? 0) > 0
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
              <Cloud size={13} className="text-soft" />
              <span className="hidden sm:inline max-w-[65px] truncate text-[11px]">
                {cloudAccount.status.error
                  ? 'Error'
                  : (cloudAccount.status.pending ?? 0) > 0
                  ? `${cloudAccount.status.pending}p`
                  : 'Cloud'}
              </span>
            </button>
          ) : (
            <button
              onClick={cloudAccount.onSignIn}
              title="Sign in to sync text chats and projects across devices"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-surface hover:bg-elevated border border-border text-muted hover:text-ink transition-colors"
            >
              <CloudOff size={13} />
              <span className="hidden sm:inline text-[11px]">Sync</span>
            </button>
          )}

          {cloudMenuOpen && cloudAccount.user && (
            <div className="absolute right-0 top-full mt-1.5 w-64 p-3 rounded-xl bg-surface border border-border shadow-xl z-50 text-xs space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink truncate" title={cloudAccount.user.email}>
                    {cloudAccount.user.email}
                  </div>
                  <div
                    className={`text-[11px] truncate ${
                      cloudAccount.status.error ? 'text-danger' : 'text-muted'
                    }`}
                  >
                    {cloudAccount.status.message}
                    {cloudAccount.status.pending ? ` · ${cloudAccount.status.pending} pending` : ''}
                  </div>
                </div>
              </div>

              {cloudAccount.status.error && (
                <button
                  onClick={() => {
                    cloudAccount.onRetry();
                    setCloudMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-accent/15 text-accent hover:bg-accent/20 transition-colors font-medium"
                >
                  <RefreshCw size={12} /> Retry sync
                </button>
              )}

              {!cloudAccount.status.imported && (
                <button
                  onClick={async () => {
                    await cloudAccount.onImportLocal();
                    setCloudMenuOpen(false);
                  }}
                  className="w-full py-1.5 px-2 rounded-lg bg-elevated hover:bg-border text-ink text-left transition-colors text-[11.5px]"
                >
                  Import local chats & projects
                </button>
              )}

              <div className="pt-1 flex items-center justify-between gap-2">
                {onOpenSettingsTab && (
                  <button
                    onClick={() => {
                      onOpenSettingsTab('connections');
                      setCloudMenuOpen(false);
                    }}
                    className="text-accent hover:underline text-[11px]"
                  >
                    Connections
                  </button>
                )}
                <button
                  onClick={async () => {
                    setCloudMenuOpen(false);
                    await cloudAccount.onSignOut();
                  }}
                  className="text-muted hover:text-danger text-[11px]"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onOpenSettings}
        title="Settings"
        className="p-2 rounded-lg text-muted hover:text-ink hover:bg-elevated transition-colors"
      >
        <SettingsIcon size={16} />
      </button>

      {onClose && (
        <button
          onClick={onClose}
          title="Close panel"
          className="p-2 rounded-lg text-muted hover:text-ink hover:bg-elevated transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </header>
  );
}
