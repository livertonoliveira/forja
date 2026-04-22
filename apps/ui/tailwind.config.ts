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
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forja: colors,
      },
      boxShadow: {
        'gold-glow': `0 0 20px ${hexToRgba(colors.gold.mid, 0.3)}, 0 0 40px ${hexToRgba(colors.gold.mid, 0.1)}`,
      },
      backgroundImage: {
        'gold-gradient': `linear-gradient(135deg, ${colors.gold.from}, ${colors.gold.mid}, ${colors.gold.to})`,
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
