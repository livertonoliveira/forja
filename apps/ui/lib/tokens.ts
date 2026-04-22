export const colors = {
  bg: {
    base: '#0A0A0A',
    surface: '#111111',
    elevated: '#1A1A1A',
    overlay: '#222222',
  },
  border: {
    subtle: '#2A2A2A',
    default: '#333333',
    gold: '#C9A84C',
    goldLight: '#E2C97E',
  },
  text: {
    primary: '#FAFAFA',
    secondary: '#A0A0A0',
    muted: '#666666',
    gold: '#C9A84C',
    goldBright: '#E2C97E',
  },
  gold: { from: '#8B6914', mid: '#C9A84C', to: '#E2C97E' },
  gate: {
    pass: { bg: '#052E16', border: '#166534', text: '#4ADE80' },
    warn: { bg: '#2D1B00', border: '#92400E', text: '#FCD34D' },
    fail: { bg: '#2D0A0A', border: '#7F1D1D', text: '#F87171' },
    unknown: { bg: '#1A1A1A', border: '#333333', text: '#A0A0A0' },
  },
} as const
