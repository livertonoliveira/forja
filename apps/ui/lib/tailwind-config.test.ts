/**
 * Integration tests — Tailwind config + tokens integration (MOB-1062)
 *
 * Run with:
 *   npx tsx lib/tailwind-config.test.ts
 * from apps/ui directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { colors } from './tokens';
import config from '../tailwind.config';

// ---------------------------------------------------------------------------
// Minimal assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function assertDeepIncludes(
  label: string,
  obj: unknown,
  keys: string[],
): void {
  const objKeys = obj && typeof obj === 'object' ? Object.keys(obj as object) : [];
  const missing = keys.filter((k) => !objKeys.includes(k));
  assert(
    label,
    missing.length === 0,
    missing.length > 0 ? `missing keys: ${missing.join(', ')}` : undefined,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

console.log('\nTailwind Config Integration Tests (MOB-1062)\n');

// --- Test 1: import without errors ---
// If we reached here the import at the top of this file succeeded.
assert(
  'Test 1 — tailwind.config.ts can be imported without errors',
  config !== undefined && config !== null,
);

// --- Test 2: darkMode: 'class' ---
assert(
  "Test 2 — config contains darkMode: 'class'",
  (config as { darkMode?: string }).darkMode === 'class',
  `got: ${JSON.stringify((config as { darkMode?: string }).darkMode)}`,
);

// --- Test 3: theme.colors.forja contains all token groups ---
const themeColors = (config as {
  theme?: { extend?: { colors?: { forja?: unknown } } };
}).theme?.extend?.colors?.forja as Record<string, unknown> | undefined;

assert(
  'Test 3a — theme.extend.colors.forja exists',
  themeColors !== undefined,
);

const expectedTokenGroups = Object.keys(colors);
assertDeepIncludes(
  'Test 3b — forja contains all token groups from tokens.ts',
  themeColors,
  expectedTokenGroups,
);

// Verify forja equals the imported colors object (same reference via config)
assert(
  'Test 3c — theme.extend.colors.forja is the colors object from tokens.ts',
  themeColors === colors,
  'expected same object reference',
);

// --- Test 4: boxShadow['gold-glow'] ---
const boxShadow = (config as {
  theme?: { extend?: { boxShadow?: Record<string, string> } };
}).theme?.extend?.boxShadow;

assert(
  "Test 4 — boxShadow['gold-glow'] is defined",
  typeof boxShadow?.['gold-glow'] === 'string' && boxShadow['gold-glow'].length > 0,
  `got: ${JSON.stringify(boxShadow?.['gold-glow'])}`,
);

// --- Test 5: backgroundImage['gold-gradient'] ---
const backgroundImage = (config as {
  theme?: { extend?: { backgroundImage?: Record<string, string> } };
}).theme?.extend?.backgroundImage;

assert(
  "Test 5 — backgroundImage['gold-gradient'] is defined",
  typeof backgroundImage?.['gold-gradient'] === 'string' &&
    backgroundImage['gold-gradient'].includes('linear-gradient'),
  `got: ${JSON.stringify(backgroundImage?.['gold-gradient'])}`,
);

// --- Test 6: animation.shimmer and keyframes.shimmer ---
const animation = (config as {
  theme?: { extend?: { animation?: Record<string, string> } };
}).theme?.extend?.animation;

assert(
  'Test 6a — animation.shimmer is defined',
  typeof animation?.shimmer === 'string' && animation.shimmer.length > 0,
  `got: ${JSON.stringify(animation?.shimmer)}`,
);

const keyframes = (config as {
  theme?: {
    extend?: {
      keyframes?: Record<string, Record<string, Record<string, string>>>;
    };
  };
}).theme?.extend?.keyframes;

assert(
  'Test 6b — keyframes.shimmer is defined',
  keyframes?.shimmer !== undefined,
);

assert(
  'Test 6c — keyframes.shimmer has 0% and 100% stops',
  typeof keyframes?.shimmer?.['0%'] === 'object' &&
    typeof keyframes?.shimmer?.['100%'] === 'object',
);

// --- Test 7: No hardcoded hex color values in tailwind.config.ts ---
const configFilePath = path.resolve(__dirname, '../tailwind.config.ts');
const configSource = fs.readFileSync(configFilePath, 'utf-8');

// Strip the import lines (tokens.ts lines) so we only check lines that belong
// to the config body itself (not what it re-exports from tokens).
const configBodyLines = configSource
  .split('\n')
  .filter((line) => !line.trim().startsWith('import'));

const hexPattern = /#([0-9A-Fa-f]{3,8})\b/g;
const hardcodedHexInBody: string[] = [];

for (const line of configBodyLines) {
  // Skip lines that are pure template literal interpolations using colors.*
  // A hex that only appears inside ${colors.xxx} is fine — but that would
  // already be stripped since the source wouldn't contain the literal hex
  // (that's resolved at runtime). So any hex literal remaining in the body
  // is truly hardcoded.
  const matches = line.match(hexPattern);
  if (matches) {
    hardcodedHexInBody.push(`  "${line.trim()}" → ${matches.join(', ')}`);
  }
}

// rgba() hex shortcuts (like rgba(201,168,76)) are NOT hex literals — they
// are decimal, so they won't match. Only #RRGGBB patterns are caught.
assert(
  'Test 7 — tailwind.config.ts contains no hardcoded hex color values',
  hardcodedHexInBody.length === 0,
  hardcodedHexInBody.length > 0
    ? `found hardcoded hex in config body:\n${hardcodedHexInBody.join('\n')}`
    : undefined,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'─'.repeat(60)}`);
const total = passed + failed;
console.log(`Results: ${passed}/${total} tests passed`);

if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nAll tests PASSED');
  process.exit(0);
}
