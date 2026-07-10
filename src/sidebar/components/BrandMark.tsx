import { useId } from 'react';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Nerdbot brand mark: a gradient rounded-square "bot" tile with a friendly
 * visor face and antenna. Pure SVG so it stays crisp at any size, in any
 * theme. Gradient ids are namespaced per-instance via useId so multiple
 * marks can render on one page.
 */
export default function BrandMark({ size = 22, className = '' }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const grad = `nbg-${uid}`;
  const shine = `nbs-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={grad} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8aa4ff" />
          <stop offset="0.55" stopColor="#c089ff" />
          <stop offset="1" stopColor="#ff8ad1" />
        </linearGradient>
        <linearGradient id={shine} x1="24" y1="6" x2="24" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* antenna */}
      <line x1="24" y1="7" x2="24" y2="12" stroke={`url(#${grad})`} strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="5.5" r="3" fill={`url(#${grad})`} />
      {/* head tile */}
      <rect x="6" y="12" width="36" height="30" rx="10" fill={`url(#${grad})`} />
      {/* top sheen */}
      <rect x="6" y="12" width="36" height="14" rx="10" fill={`url(#${shine})`} />
      {/* eyes */}
      <rect x="14.5" y="21.5" width="6" height="9.5" rx="3" fill="#fff" />
      <rect x="27.5" y="21.5" width="6" height="9.5" rx="3" fill="#fff" />
      {/* smile */}
      <path
        d="M18.5 35.5c1.6 1.5 3.5 2.2 5.5 2.2s3.9-.7 5.5-2.2"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
    </svg>
  );
}
