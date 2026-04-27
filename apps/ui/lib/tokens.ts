export const colors = {
  bg: {
    base: '#FFFFFF',
    surface: '#F8F8F8',
    elevated: '#F0F0F0',
    overlay: '#E8E8E8',
  },
  border: {
    subtle: '#E8E8E8',
    default: '#D4D4D4',
    gold: '#C9A84C',
    goldLight: '#E2C97E',
  },
  text: {
    primary: '#0A0A0A',
    secondary: '#555555',
    muted: '#888888',
    gold: '#A67C21',
    goldBright: '#C9A84C',
  },
  gold: { from: '#8B6914', mid: '#C9A84C', to: '#E2C97E' },
  gate: {
    pass: { bg: '#F0FDF4', border: '#86EFAC', text: '#15803D' },
    warn: { bg: '#FFFBEB', border: '#FCD34D', text: '#B45309' },
    fail: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626' },
    unknown: { bg: '#F8F8F8', border: '#D4D4D4', text: '#888888' },
  },
} as const
