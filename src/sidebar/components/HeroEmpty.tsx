import { Sparkles, FileText, Lightbulb, Mail, Map, ArrowUpRight } from 'lucide-react';
import BrandMark from './BrandMark';

interface Props {
  onSuggest: (text: string) => void;
  needsSetup?: boolean;
  onSetup?: () => void;
}

export const SUGGESTIONS = [
  { icon: FileText, text: 'Summarize the page I’m on' },
  { icon: Lightbulb, text: 'Explain a concept like I’m 12' },
  { icon: Mail, text: 'Draft a polite reply to this email' },
  { icon: Map, text: 'Plan a weekend in Lisbon' },
];

export default function HeroEmpty({ onSuggest, needsSetup, onSetup }: Props) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center px-6 pt-12 pb-10 nb-hero-glow">
      <div className="relative mb-5 animate-fade-in">
        <div className="absolute inset-0 -m-4 rounded-full bg-accent/20 blur-2xl" aria-hidden="true" />
        <BrandMark size={64} className="relative drop-shadow-lg" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="nb-brand-gradient">Hi, I’m Nerdbot.</span>
      </h1>
      <p className="text-sm text-muted mt-2 max-w-[360px]">
        Ask anything, share the page you’re on, or type{' '}
        <kbd className="px-1.5 py-0.5 mx-0.5 text-[11px] rounded-md bg-elevated border border-border text-ink">
          /
        </kbd>{' '}
        to use a skill.
      </p>

      {needsSetup && (
        <button
          onClick={onSetup}
          className="w-full max-w-[360px] mt-6 px-4 py-3 rounded-xl border border-accent/50 bg-accent/10 hover:bg-accent/15 text-left transition-colors"
        >
          <div className="flex items-start gap-2.5">
            <Sparkles size={16} className="text-accent mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-ink">Set up your AI provider</div>
              <div className="text-xs text-muted mt-0.5">
                Add a free Gemini or OpenRouter key — takes 2 minutes
              </div>
            </div>
          </div>
        </button>
      )}

      <div className="grid grid-cols-1 gap-2 w-full max-w-[360px] mt-7">
        {SUGGESTIONS.map(({ icon: Icon, text }) => (
          <button
            key={text}
            onClick={() => onSuggest(text)}
            className="group flex items-center gap-3 text-left text-[13px] text-ink/90 px-3.5 py-2.5 rounded-xl bg-surface hover:bg-elevated border border-border hover:border-accent/40 transition-all hover:-translate-y-px"
          >
            <Icon size={15} className="shrink-0 text-soft group-hover:text-accent transition-colors" />
            <span className="flex-1">{text}</span>
            <ArrowUpRight
              size={13}
              className="shrink-0 text-soft opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
