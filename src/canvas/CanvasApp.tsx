import { useEffect, useState } from 'react';
import { Code2, LayoutTemplate, X } from 'lucide-react';

// The preview iframe is sandboxed WITHOUT allow-same-origin (previewed code
// must never reach the extension origin / chrome.storage), which makes
// localStorage/sessionStorage throw. Shim them with in-memory versions so
// generated snippets that persist state still run.
const STORAGE_SHIM = `<script>(function(){
  var need = false;
  try { window.localStorage; } catch (e) { need = true; }
  if (!need) return;
  var mk = function () {
    var s = {};
    return {
      getItem: function (k) { return k in s ? s[k] : null; },
      setItem: function (k, v) { s[k] = String(v); },
      removeItem: function (k) { delete s[k]; },
      clear: function () { s = {}; },
      key: function (i) { return Object.keys(s)[i] ?? null; },
      get length() { return Object.keys(s).length; }
    };
  };
  Object.defineProperty(window, 'localStorage', { value: mk() });
  Object.defineProperty(window, 'sessionStorage', { value: mk() });
})();</script>`;

export default function CanvasApp() {
  const [code, setCode] = useState('');
  const [lang, setLang] = useState('html');
  const [split, setSplit] = useState(true);

  useEffect(() => {
    // Determine system theme purely from matchMedia since we don't have settings loaded here yet
    const prefDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefDark);
    document.documentElement.classList.toggle('light', !prefDark);

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['canvas_code', 'canvas_lang'], (res) => {
        if (res.canvas_code) setCode(res.canvas_code);
        if (res.canvas_lang) setLang(res.canvas_lang);
      });
    }
  }, []);

  return (
    <div className="flex flex-col h-screen bg-bg text-ink font-sans">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-elevated/50">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="text-accent" size={18} />
          <span className="font-semibold tracking-wide text-[14px]">Canvas</span>
          <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] uppercase tracking-wider text-muted ml-2">
            {lang}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setSplit(!split)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-all text-[12px] text-muted hover:text-ink"
          >
            <Code2 size={14} />
            {split ? 'Hide code' : 'Show code'}
          </button>
          <button 
            onClick={() => window.close()}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {split && (
          <div className="w-1/2 border-r border-border bg-surface flex flex-col">
             <div className="px-3 py-1.5 text-[11px] text-muted font-mono border-b border-border bg-bg/50">source code</div>
             <textarea 
               value={code}
               onChange={e => setCode(e.target.value)}
               className="flex-1 w-full bg-transparent resize-none p-4 font-mono text-[13px] text-ink outline-none leading-relaxed"
               spellCheck={false}
             />
          </div>
        )}
        <div className={`flex flex-col ${split ? 'w-1/2' : 'w-full'} bg-white`}>
           <iframe
             srcDoc={STORAGE_SHIM + code}
             className="w-full h-full border-none"
             sandbox="allow-scripts allow-forms"
           />
        </div>
      </div>
    </div>
  );
}
