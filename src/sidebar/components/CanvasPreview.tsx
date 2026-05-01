import { Maximize2 } from 'lucide-react';
import React from 'react';

export default function CanvasPreview({ code, lang }: { code: string; lang: string }) {
  const openCanvas = () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ canvas_code: code, canvas_lang: lang }, () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('canvas.html') });
      });
    }
  };

  return (
    <div className="my-3 rounded-xl border border-border bg-surface overflow-hidden shadow-sm group">
      <div className="flex items-center justify-between px-3 py-2 bg-elevated border-b border-border">
        <span className="text-[11px] font-medium text-muted flex items-center gap-1.5 uppercase tracking-wide">
          ✨ Canvas: {lang}
        </span>
        <button 
          onClick={openCanvas}
          className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded text-accent hover:bg-accent/15 transition-colors"
        >
          <Maximize2 size={11} /> Expand
        </button>
      </div>
      <div className="h-[200px] w-full bg-white">
        <iframe 
          srcDoc={code}
          className="w-full h-full border-none pointer-events-none origin-top-left"
          sandbox="allow-scripts"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
