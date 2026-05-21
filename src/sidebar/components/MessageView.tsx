import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { LucideIcon } from 'lucide-react';
import { Check, Copy, Edit3, Pin, RefreshCw, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import React, { useRef, useState } from 'react';
import 'highlight.js/styles/github-dark.css';

import BrandMark from './BrandMark';
import CanvasPreview from './CanvasPreview';
import { dataUrl } from '../../services/attachments';
import { speak, cancelSpeech, isSpeechSupported } from '../../services/speech';
import type { Message, Skill } from '../../services/types';

interface Props {
  message: Message;
  showSuggestions?: boolean;
  suggestions?: Skill[];
  onSuggest?: (skill: Skill) => void;
  onEdit?: (id: string) => void;
  onRewind?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onPin?: (id: string) => void;
  isLastAssistant?: boolean;
}

export default function MessageView({
  message,
  showSuggestions,
  suggestions,
  onSuggest,
  onEdit,
  onRewind,
  onRegenerate,
  onPin,
  isLastAssistant,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-slide-up group">
        <div className="max-w-[88%] flex flex-col items-end gap-1.5">
          {message.attachments && message.attachments.filter((a) => !a.hidden).length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {message.attachments.filter((a) => !a.hidden).map((a) =>
                a.kind === 'image' || a.kind === 'screenshot' ? (
                  <img
                    key={a.id}
                    src={dataUrl(a)}
                    alt={a.name}
                    className="max-w-[180px] max-h-[180px] rounded-xl border border-border object-cover"
                  />
                ) : a.kind === 'audio' ? (
                  <audio
                    key={a.id}
                    controls
                    src={dataUrl(a)}
                    className="max-w-[200px] h-[36px]"
                  />
                ) : (
                  <div
                    key={a.id}
                    className="text-[11px] px-2 py-1 rounded-md bg-elevated border border-border text-muted"
                  >
                    📄 {a.name}
                  </div>
                )
              )}
            </div>
          )}
          <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-elevated text-ink text-[14px] leading-relaxed border border-border">
            {message.content}
          </div>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
            {onEdit && (
              <button
                onClick={() => onEdit(message.id)}
                className="text-[10.5px] text-muted hover:text-ink flex items-center gap-1"
                title="Edit and resend"
              >
                <Edit3 size={10} /> Edit
              </button>
            )}
            {onRewind && (
              <button
                onClick={() => onRewind(message.id)}
                className="text-[10.5px] text-muted hover:text-ink flex items-center gap-1"
                title="Rewind to here"
              >
                <RotateCcw size={10} /> Rewind
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* no-op */
    }
  };

  const handleSpeak = () => {
    if (speaking) {
      cancelSpeech();
      setSpeaking(false);
      return;
    }
    speak(message.content, { onEnd: () => setSpeaking(false) });
    setSpeaking(true);
  };

  return (
    <div className="flex gap-3 animate-fade-in">
      <BrandMark size={22} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={`nb-prose ${message.pending ? 'nb-cursor' : ''}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
            components={{
              pre: CodeBlockPre,
            }}
          >
            {message.content || ' '}
          </ReactMarkdown>
        </div>

        {message.attachments && message.attachments.filter((a) => !a.hidden).length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2">
            {message.attachments.filter((a) => !a.hidden).map((a) =>
              a.kind === 'image' || a.kind === 'screenshot' ? (
                <a
                  key={a.id}
                  href={dataUrl(a)}
                  download={a.name}
                  className="block group/img"
                  title="Click to download"
                >
                  <img
                    src={dataUrl(a)}
                    alt={a.name}
                    className="max-w-full max-h-[400px] rounded-xl border border-border group-hover/img:brightness-110 transition"
                  />
                </a>
              ) : a.kind === 'audio' ? (
                <audio
                  key={a.id}
                  controls
                  src={dataUrl(a)}
                  className="max-w-full h-[40px] rounded-lg"
                />
              ) : null
            )}
          </div>
        )}

        {!message.pending && message.content.length > 0 && (
          <div className="flex items-center gap-0.5 mt-2 -ml-1.5">
            <ActionBtn icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy'} onClick={handleCopy} />
            {isSpeechSupported() && (
              <ActionBtn icon={speaking ? VolumeX : Volume2} label={speaking ? 'Stop' : 'Read'} onClick={handleSpeak} />
            )}
            {isLastAssistant && onRegenerate && (
              <ActionBtn icon={RefreshCw} label="Regenerate" onClick={() => onRegenerate(message.id)} />
            )}
            {onPin && <ActionBtn icon={Pin} label="Pin" onClick={() => onPin(message.id)} />}
          </div>
        )}

        {showSuggestions && suggestions && suggestions.length > 0 && onSuggest && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => onSuggest(s)}
                className="text-[12px] px-2.5 py-1 rounded-full bg-surface border border-border text-muted hover:text-ink hover:border-accent/60 transition-colors flex items-center gap-1"
              >
                <span>{s.emoji}</span>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] text-muted hover:text-ink px-2 py-1 rounded-md hover:bg-elevated transition-colors flex items-center gap-1"
      title={label}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

/** Recursively extract raw text from a React element tree (strings, numbers, arrays, elements with children). */
function extractText(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && node.props) return extractText(node.props.children);
  return '';
}

/** <pre> wrapper that adds a "Copy" button in the corner, or renders CanvasPreview for HTML/SVG. */
function CodeBlockPre(props: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // Detect language from the <code> React child (works during render, no DOM needed)
  const codeChild = React.Children.toArray(props.children).find(
    (c: any) => c?.props?.className && /language-/.test(c.props.className)
  ) as any;

  const langMatch = codeChild?.props?.className?.match(/language-([\w-]+)/);
  const lang = langMatch ? langMatch[1] : '';

  // For html/svg, extract the raw text from the React element tree and render Canvas
  if ((lang === 'html' || lang === 'svg') && codeChild) {
    const rawCode = extractText(codeChild.props.children);
    return <CanvasPreview code={rawCode} lang={lang} />;
  }

  const copy = async () => {
    const text = ref.current?.querySelector('code')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="relative group/code my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-elevated border border-border border-b-0 rounded-t-xl text-[11px] text-muted">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 hover:text-ink transition-colors"
          title="Copy"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        ref={ref}
        {...props}
        className="!mt-0 !rounded-t-none !border-t-0 nb-codeblock"
      />
    </div>
  );
}

