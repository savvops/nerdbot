import BrandMark from './BrandMark';

interface Props {
  onSuggest: (text: string) => void;
}

const SUGGESTIONS = [
  'Summarize the page I’m on',
  'Explain a concept like I’m 12',
  'Draft a polite reply to this email',
  'Plan a weekend in Lisbon',
];

export default function HeroEmpty({ onSuggest }: Props) {
  return (
    <div className="relative flex flex-col items-center justify-center text-center px-6 pt-12 pb-10 nb-hero-glow">
      <BrandMark size={56} className="mb-4 animate-fade-in" />
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

      <div className="grid grid-cols-1 gap-2 w-full max-w-[360px] mt-7">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="text-left text-[13px] text-ink/90 px-3.5 py-2.5 rounded-xl bg-surface hover:bg-elevated border border-border transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
