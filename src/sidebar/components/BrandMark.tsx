interface Props {
  size?: number;
  className?: string;
}

export default function BrandMark({ size = 22, className = '' }: Props) {
  return (
    <span
      className={`relative inline-block rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full nb-brand-orb"
        style={{ filter: 'blur(0.4px)' }}
      />
      <span
        className="absolute rounded-full bg-bg"
        style={{ inset: size * 0.28 }}
      />
    </span>
  );
}
