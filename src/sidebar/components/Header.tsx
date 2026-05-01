import { Camera, Menu, Plus, Settings as SettingsIcon, X } from 'lucide-react';
import BrandMark from './BrandMark';

interface Props {
  title: string;
  hasMessages: boolean;
  onToggleDrawer: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onClose?: () => void;
  onCaptureScreenshot: () => void;
  visionCapable: boolean;
  /** Optional active project chip — clicking it opens the project. */
  activeProject?: { name: string; emoji: string } | null;
  onOpenActiveProject?: () => void;
}

export default function Header({
  title,
  hasMessages,
  onToggleDrawer,
  onNewChat,
  onOpenSettings,
  onClose,
  onCaptureScreenshot,
  visionCapable,
  activeProject,
  onOpenActiveProject,
}: Props) {
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
