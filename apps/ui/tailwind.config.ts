import type { Config } from 'tailwindcss';
import { colors } from './lib/tokens';

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './.storybook/**/*.{ts,tsx}'],
  safelist: [
    'font-display', 'font-sans', 'font-mono',
    'text-6xl', 'text-5xl', 'text-4xl', 'text-3xl', 'text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-xs', 'text-[10px]',
    'leading-none', 'leading-tight', 'leading-snug', 'leading-relaxed', 'leading-normal',
    'tracking-tight', 'tracking-[0.2em]', 'tracking-[0.25em]',
    'font-semibold', 'font-medium',
    'uppercase',
    'text-forja-text-gold', 'text-forja-text-gold/80',
  ],
  theme: {
    extend: {
      colors: {
        forja: colors,
      },
      boxShadow: {
        'gold-glow': `0 0 20px ${hexToRgba(colors.gold.mid, 0.3)}, 0 0 40px ${hexToRgba(colors.gold.mid, 0.1)}`,
        'gold-glow-strong': `0 0 20px ${hexToRgba(colors.gold.mid, 0.5)}, 0 0 40px ${hexToRgba(colors.gold.mid, 0.25)}`,
        'surface': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
      },
      backgroundImage: {
        'gold-gradient': `linear-gradient(135deg, ${colors.gold.from}, ${colors.gold.mid}, ${colors.gold.to})`,
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
        'fade-in-up': 'fade-in-up 300ms ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
