/**
 * Unit tests for apps/ui/lib/tokens.ts
 * Uses Node.js built-in test runner (node:test + node:assert).
 * Run: node --import tsx/esm --test lib/tokens.test.ts
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { colors } from './tokens.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the string is a valid 6-digit hex color (#RRGGBB). */
function isHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

/** Linearise a single 8-bit channel to sRGB linear light. */
function linearise(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance (WCAG 2.x) of a hex color string. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
}

/** WCAG contrast ratio between two hex colors. */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1)
  const l2 = luminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('colors export', () => {
  test('colors object is exported', () => {
    assert.ok(colors !== undefined, 'colors should be defined')
    assert.strictEqual(typeof colors, 'object', 'colors should be an object')
  })

  test('colors has all required top-level groups: bg, border, text, gold, gate', () => {
    const requiredGroups = ['bg', 'border', 'text', 'gold', 'gate']
    for (const group of requiredGroups) {
      assert.ok(
        group in colors,
        `colors should have group "${group}"`,
      )
    }
  })
})

describe('colors.bg', () => {
  test('has required keys: base, surface, elevated, overlay', () => {
    const required = ['base', 'surface', 'elevated', 'overlay']
    for (const key of required) {
      assert.ok(key in colors.bg, `colors.bg should have key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.bg)) {
      assert.ok(isHex(value), `colors.bg.${key} = "${value}" is not a valid hex color`)
    }
  })
})

describe('colors.border', () => {
  test('has required keys: subtle, default, gold, goldLight', () => {
    const required = ['subtle', 'default', 'gold', 'goldLight']
    for (const key of required) {
      assert.ok(key in colors.border, `colors.border should have key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.border)) {
      assert.ok(isHex(value), `colors.border.${key} = "${value}" is not a valid hex color`)
    }
  })
})

describe('colors.text', () => {
  test('has required keys: primary, secondary, muted, gold, goldBright', () => {
    const required = ['primary', 'secondary', 'muted', 'gold', 'goldBright']
    for (const key of required) {
      assert.ok(key in colors.text, `colors.text should have key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.text)) {
      assert.ok(isHex(value), `colors.text.${key} = "${value}" is not a valid hex color`)
    }
  })
})

describe('colors.gold', () => {
  test('has required keys: from, mid, to', () => {
    const required = ['from', 'mid', 'to']
    for (const key of required) {
      assert.ok(key in colors.gold, `colors.gold should have key "${key}"`)
    }
  })

  test('all values are valid hex strings', () => {
    for (const [key, value] of Object.entries(colors.gold)) {
      assert.ok(isHex(value), `colors.gold.${key} = "${value}" is not a valid hex color`)
    }
  })
})

describe('colors.gate', () => {
  test('has required keys: pass, warn, fail, unknown', () => {
    const required = ['pass', 'warn', 'fail', 'unknown']
    for (const key of required) {
      assert.ok(key in colors.gate, `colors.gate should have key "${key}"`)
    }
  })

  test('each gate variant has bg, border, text sub-keys', () => {
    for (const [variant, values] of Object.entries(colors.gate)) {
      assert.ok('bg' in values, `colors.gate.${variant} should have "bg"`)
      assert.ok('border' in values, `colors.gate.${variant} should have "border"`)
      assert.ok('text' in values, `colors.gate.${variant} should have "text"`)
    }
  })

  test('all gate values are valid hex strings', () => {
    for (const [variant, values] of Object.entries(colors.gate)) {
      for (const [key, value] of Object.entries(values)) {
        assert.ok(
          isHex(value),
          `colors.gate.${variant}.${key} = "${value}" is not a valid hex color`,
        )
      }
    }
  })
})

describe('WCAG AA contrast (≥ 4.5:1)', () => {
  test('text.primary (#FAFAFA) over bg.base (#0A0A0A) has ratio ≥ 4.5', () => {
    const ratio = contrastRatio(colors.text.primary, colors.bg.base)
    assert.ok(
      ratio >= 4.5,
      `Expected contrast ≥ 4.5 but got ${ratio.toFixed(2)} for text.primary over bg.base`,
    )
  })

  test('text.gold (#C9A84C) over bg.surface (#111111) has ratio ≥ 4.5', () => {
    const ratio = contrastRatio(colors.text.gold, colors.bg.surface)
    assert.ok(
      ratio >= 4.5,
      `Expected contrast ≥ 4.5 but got ${ratio.toFixed(2)} for text.gold over bg.surface`,
    )
  })
})
