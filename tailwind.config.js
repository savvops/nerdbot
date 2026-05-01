/** @type {import('tailwindcss').Config} */
export default {
  content: ['./sidebar.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--nb-bg) / <alpha-value>)',
        surface: 'rgb(var(--nb-surface) / <alpha-value>)',
        elevated: 'rgb(var(--nb-elevated) / <alpha-value>)',
        border: 'rgb(var(--nb-border) / <alpha-value>)',
        ink: 'rgb(var(--nb-ink) / <alpha-value>)',
        muted: 'rgb(var(--nb-muted) / <alpha-value>)',
        soft: 'rgb(var(--nb-soft) / <alpha-value>)',
        accent: 'rgb(var(--nb-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--nb-accent-soft) / <alpha-value>)',
        success: 'rgb(var(--nb-success) / <alpha-value>)',
        danger: 'rgb(var(--nb-danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Google Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 220ms ease-out',
        'slide-up': 'slideUp 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
    },
  },
  plugins: [],
};
