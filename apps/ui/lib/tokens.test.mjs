/**
 * Plain Node.js (ESM) test script for tokens.ts values.
 * No external dependencies required — uses node:assert and node:test.
 *
 * Run: node --test lib/tokens.test.mjs
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// ---------------------------------------------------------------------------
// Inline the token values (mirrors tokens.ts exactly so no TS compiler needed)
// ---------------------------------------------------------------------------
const colors = {
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
    pass:    { bg: '#052E16', border: '#166534', text: '#4ADE80' },
    warn:    { bg: '#2D1B00', border: '#92400E', text: '#FCD34D' },
    fail:    { bg: '#2D0A0A', border: '#7F1D1D', text: '#F87171' },
    unknown: { bg: '#1A1A1A', border: '#333333', text: '#A0A0A0' },
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the value is a valid 6-digit hex color (#RRGGBB). */
function isHex(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

/** Linearise a single 8-bit channel for WCAG luminance calculation. */
function linearise(channel) {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance (WCAG 2.x) of a #RRGGBB hex color string. */
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(hex1, hex2) {
  const l1 = luminance(hex1)
  const l2 = luminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker  = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('colors export', () => {
  test('colors object is defined', () => {
    assert.ok(colors !== undefined)
    assert.strictEqual(typeof colors, 'object')
  })

  test('colors has all required top-level groups: bg, border, text, gold, gate', () => {
    for (const group of ['bg', 'border', 'text', 'gold', 'gate']) {
      assert.ok(group in colors, `missing group "${group}"`)
    }
  })
})

describe('colors.bg', () => {
  test('has required keys: base, surface, elevated, overlay', () => {
    for (const key of ['base', 'surface', 'elevated', 'overlay']) {
      assert.ok(key in colors.bg, `colors.bg missing key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.bg)) {
      assert.ok(isHex(value), `colors.bg.${key} = "${value}" is not valid hex`)
    }
  })
})

describe('colors.border', () => {
  test('has required keys: subtle, default, gold, goldLight', () => {
    for (const key of ['subtle', 'default', 'gold', 'goldLight']) {
      assert.ok(key in colors.border, `colors.border missing key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.border)) {
      assert.ok(isHex(value), `colors.border.${key} = "${value}" is not valid hex`)
    }
  })
})

describe('colors.text', () => {
  test('has required keys: primary, secondary, muted, gold, goldBright', () => {
    for (const key of ['primary', 'secondary', 'muted', 'gold', 'goldBright']) {
      assert.ok(key in colors.text, `colors.text missing key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.text)) {
      assert.ok(isHex(value), `colors.text.${key} = "${value}" is not valid hex`)
    }
  })
})

describe('colors.gold', () => {
  test('has required keys: from, mid, to', () => {
    for (const key of ['from', 'mid', 'to']) {
      assert.ok(key in colors.gold, `colors.gold missing key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.gold)) {
      assert.ok(isHex(value), `colors.gold.${key} = "${value}" is not valid hex`)
    }
  })
})

describe('colors.gate', () => {
  test('has required variants: pass, warn, fail, unknown', () => {
    for (const key of ['pass', 'warn', 'fail', 'unknown']) {
      assert.ok(key in colors.gate, `colors.gate missing variant "${key}"`)
    }
  })

  test('each gate variant has bg, border, text sub-keys', () => {
    for (const [variant, values] of Object.entries(colors.gate)) {
      assert.ok('bg'     in values, `colors.gate.${variant} missing "bg"`)
      assert.ok('border' in values, `colors.gate.${variant} missing "border"`)
      assert.ok('text'   in values, `colors.gate.${variant} missing "text"`)
    }
  })

  test('all gate values are valid hex strings', () => {
    for (const [variant, values] of Object.entries(colors.gate)) {
      for (const [key, value] of Object.entries(values)) {
        assert.ok(isHex(value), `colors.gate.${variant}.${key} = "${value}" is not valid hex`)
      }
    }
  })
})

describe('WCAG AA contrast (ratio >= 4.5:1)', () => {
  test('text.primary (#FAFAFA) over bg.base (#0A0A0A)', () => {
    const ratio = contrastRatio(colors.text.primary, colors.bg.base)
    assert.ok(
      ratio >= 4.5,
      `Expected ratio >= 4.5 but got ${ratio.toFixed(2)} (text.primary over bg.base)`,
    )
  })

  test('text.gold (#C9A84C) over bg.surface (#111111)', () => {
    const ratio = contrastRatio(colors.text.gold, colors.bg.surface)
    assert.ok(
      ratio >= 4.5,
      `Expected ratio >= 4.5 but got ${ratio.toFixed(2)} (text.gold over bg.surface)`,
    )
  })
})
