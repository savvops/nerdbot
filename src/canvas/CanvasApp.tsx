import { useEffect, useState } from 'react';
import { Check, Code2, Copy, Download, LayoutTemplate, RefreshCw, X } from 'lucide-react';

// Safe in-memory storage shim for sandboxed preview iframe without allow-same-origin.
// Every property access is guarded in try/catch to prevent unhandled TypeErrors.
const STORAGE_SHIM = `<script>(function(){
  try {
    window.localStorage;
  } catch (e) {
    try {
      var _data = {};
      var _makeStorage = function() {
        return {
          getItem: function(k) { return k in _data ? _data[k] : null; },
          setItem: function(k, v) { _data[k] = String(v); },
          removeItem: function(k) { delete _data[k]; },
          clear: function() { _data = {}; },
          key: function(i) { return Object.keys(_data)[i] || null; },
          get length() { return Object.keys(_data).length; }
        };
      };
      var _shim = _makeStorage();
      try {
        Object.defineProperty(window, 'localStorage', { value: _shim, configurable: true, writable: true });
        Object.defineProperty(window, 'sessionStorage', { value: _shim, configurable: true, writable: true });
      } catch (_1) {
        try {
          Object.defineProperty(Object.getPrototypeOf(window), 'localStorage', { get: function() { return _shim; } });
          Object.defineProperty(Object.getPrototypeOf(window), 'sessionStorage', { get: function() { return _shim; } });
        } catch (_2) {}
      }
    } catch (_outer) {}
  }
})();</script>`;

function buildPreviewDoc(rawCode: string, lang: string): string {
  if (!rawCode || !rawCode.trim()) return '';
  const trimmed = rawCode.trim();

  // If the snippet is pure SVG, wrap it in a centered canvas page
  if (lang === 'svg' || (trimmed.startsWith('<svg') && trimmed.endsWith('</svg>'))) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      background: #0f172a;
      overflow: hidden;
    }
    svg { max-width: 90%; max-height: 90%; }
  </style>
</head>
<body>
  ${trimmed}
</body>
</html>`;
  }

  // If the snippet is a complete HTML document, inject the safe shim cleanly inside <head>
  if (trimmed.includes('<head>')) {
    return trimmed.replace('<head>', '<head>' + STORAGE_SHIM);
  } else if (trimmed.includes('<html>')) {
    return trimmed.replace('<html>', '<html><head>' + STORAGE_SHIM + '</head>');
  } else if (trimmed.includes('<!DOCTYPE') || trimmed.includes('<body')) {
    return STORAGE_SHIM + trimmed;
  }

  // Fragment (CSS/JS/HTML without wrapper)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${STORAGE_SHIM}
</head>
<body>
  ${trimmed}
</body>
</html>`;
}

export default function CanvasApp() {
  const [code, setCode] = useState('');
  const [debouncedCode, setDebouncedCode] = useState('');
  const [lang, setLang] = useState('html');
  const [split, setSplit] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Determine system theme
    const prefDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefDark);
    document.documentElement.classList.toggle('light', !prefDark);

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['canvas_code', 'canvas_lang'], (res) => {
        if (res.canvas_code) {
          setCode(res.canvas_code);
          setDebouncedCode(res.canvas_code);
        }
        if (res.canvas_lang) setLang(res.canvas_lang);
      });
    } else {
      setCode(localStorage.getItem('canvas_code') || '');
      setLang(localStorage.getItem('canvas_lang') || 'html');
    }
  }, []);

  // Debounce code updates to avoid thrashing the iframe while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCode(code);
    }, 250);
    return () => clearTimeout(timer);
  }, [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const ext = lang === 'svg' ? 'svg' : 'html';
    const blob = new Blob([code], { type: lang === 'svg' ? 'image/svg+xml' : 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `canvas-${Date.now()}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const previewSrcDoc = buildPreviewDoc(debouncedCode, lang);

  return (
    <div className="flex flex-col h-screen bg-bg text-ink font-sans">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-elevated/50">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="text-accent" size={18} />
          <span className="font-semibold tracking-wide text-[14px]">Canvas</span>
          <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] uppercase tracking-wider text-muted ml-2">
            {lang}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefresh}
            title="Reload preview"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink"
          >
            <RefreshCw size={13} />
            <span>Reload</span>
          </button>
          <button
            onClick={handleDownload}
            title="Download file"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink"
          >
            <Download size={13} />
            <span>Export</span>
          </button>
          <button
            onClick={() => setSplit(!split)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink"
          >
            <Code2 size={13} />
            {split ? 'Hide code' : 'Show code'}
          </button>
          <div className="h-4 w-[1px] bg-border mx-1" />
          <button
            onClick={() => window.close()}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface transition-colors"
            title="Close Canvas"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {split && (
          <div className="w-1/2 border-r border-border bg-surface flex flex-col h-full">
            <div className="px-3 py-1.5 text-[11px] text-muted font-mono border-b border-border bg-bg/50 flex items-center justify-between">
              <span>source code</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-ink transition-colors"
              >
                {copied ? <Check size={11} className="text-accent" /> : <Copy size={11} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 w-full bg-transparent resize-none p-4 font-mono text-[13px] text-ink outline-none leading-relaxed"
              spellCheck={false}
              placeholder="Paste or edit HTML / SVG here..."
            />
          </div>
        )}

        <div className={`flex-1 flex flex-col ${split ? 'w-1/2' : 'w-full'} h-full bg-white relative overflow-hidden`}>
          {previewSrcDoc ? (
            <iframe
              key={`${refreshKey}-${previewSrcDoc.length > 0}`}
              srcDoc={previewSrcDoc}
              className="flex-1 w-full h-full border-none"
              sandbox="allow-scripts allow-forms allow-modals"
              title="Canvas Preview"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted text-[13px] font-sans">
              Waiting for code to preview...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
