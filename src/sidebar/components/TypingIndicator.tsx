import BrandMark from './BrandMark';

export default function TypingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div className="flex gap-3 animate-fade-in">
      <BrandMark size={22} className="mt-0.5" />
      <div className="flex items-center gap-2 text-[13px] text-muted h-7">
        <span className="flex items-center gap-1">
          <span className="nb-dot" />
          <span className="nb-dot" />
          <span className="nb-dot" />
        </span>
        <span>{label}…</span>
      </div>
    </div>
  );
}
