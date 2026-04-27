export const typography = {
  display: {
    '2xl': 'font-display text-6xl leading-none tracking-tight',
    'xl':  'font-display text-5xl leading-tight tracking-tight',
    'lg':  'font-display text-4xl leading-tight tracking-tight',
    'md':  'font-display text-3xl leading-snug',
  },
  heading: {
    'xl': 'font-sans text-2xl font-semibold tracking-tight',
    'lg': 'font-sans text-xl font-semibold tracking-tight',
    'md': 'font-sans text-lg font-semibold',
    'sm': 'font-sans text-base font-semibold',
  },
  body: {
    'lg': 'font-sans text-base leading-relaxed',
    'md': 'font-sans text-sm leading-normal',
    'sm': 'font-sans text-xs leading-normal',
  },
  mono: {
    'md': 'font-mono text-sm tracking-tight',
    'sm': 'font-mono text-xs tracking-tight',
  },
  label: {
    'md': 'font-sans text-xs uppercase tracking-[0.2em] text-forja-text-gold font-medium',
    'sm': 'font-sans text-[10px] uppercase tracking-[0.25em] text-forja-text-gold/80 font-medium',
  },
} as const
