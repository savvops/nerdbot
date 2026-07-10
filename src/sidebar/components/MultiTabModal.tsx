import { useEffect, useState } from 'react';
import { Check, Globe, X } from 'lucide-react';
import { listTabs, shortHost } from '../../services/pageContext';
import type { SharedTab } from '../../services/types';

interface Props {
  open: boolean;
  selected: number[];
  excludedTabId?: number;
  onClose: () => void;
  onConfirm: (tabIds: number[]) => void;
}

export default function MultiTabModal({ open, selected, excludedTabId, onClose, onConfirm }: Props) {
  const [tabs, setTabs] = useState<SharedTab[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set(selected));

  useEffect(() => {
    if (!open) return;
    setPicked(new Set(selected.filter((id) => id !== excludedTabId)));
    listTabs()
      .then((items) => {
        setTabs(items.filter((tab) => tab.tabId !== excludedTabId));
      })
      .catch((error) => {
        console.debug('Failed to list tabs:', error);
        setTabs([]);
      });
  }, [open, selected, excludedTabId]);

  if (!open) return null;

  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else if (next.size < 3) next.add(id);
    setPicked(next);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/55 animate-fade-in">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div>
            <div className="text-[13.5px] font-semibold">Share tabs</div>
            <div className="text-[11px] text-muted">Up to 3 · {picked.size} selected</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-elevated"
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto p-2 flex-1">
          {tabs.map((t) => {
            const on = picked.has(t.tabId);
            return (
              <button
                key={t.tabId}
                onClick={() => toggle(t.tabId)}
                className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-xl text-left transition-colors mb-1 ${
                  on ? 'bg-accent/15 border border-accent/40' : 'border border-transparent hover:bg-elevated'
                }`}
              >
                <div className="grid place-items-center w-7 h-7 rounded-md bg-bg shrink-0">
                  {on ? <Check size={14} className="text-accent" /> : <Globe size={13} className="text-muted" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">{t.title || shortHost(t.url)}</div>
                  <div className="text-[11px] text-muted truncate">{shortHost(t.url)}</div>
                </div>
              </button>
            );
          })}
          {tabs.length === 0 && (
            <div className="px-3 py-6 text-center text-muted text-[12.5px]">
              No tabs available.
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 bg-bg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[13px] text-muted hover:text-ink hover:bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(Array.from(picked))}
            className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-bg hover:brightness-110 shadow-md shadow-accent/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
