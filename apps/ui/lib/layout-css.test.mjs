import fs from 'fs';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const layoutPath = path.join(ROOT, 'app/layout.tsx');
const cssPath = path.join(ROOT, 'app/globals.css');

const layout = fs.readFileSync(layoutPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

// ─── layout.tsx assertions ────────────────────────────────────────────────────
console.log('\n[layout.tsx]');

check(
  'imports Inter from next/font/google',
  /import\s*\{[^}]*\bInter\b[^}]*\}\s*from\s*['"]next\/font\/google['"]/.test(layout)
);

check(
  'imports JetBrains_Mono from next/font/google',
  /import\s*\{[^}]*\bJetBrains_Mono\b[^}]*\}\s*from\s*['"]next\/font\/google['"]/.test(layout)
);

check(
  '<html> element has the "dark" class',
  /<html[^>]+className=[^>]*\bdark\b[^>]*>/.test(layout)
);

check(
  'uses bg-forja-bg-base token class',
  /bg-forja-bg-base/.test(layout)
);

check(
  'uses text-forja-text-primary token class',
  /text-forja-text-primary/.test(layout)
);

// Hardcoded color classes that must NOT appear
const forbiddenClasses = [
  'bg-gray-950',
  'text-gray-100',
  'text-gray-300',
  'text-gray-500',
  'border-gray-800',
  'hover:bg-gray-800',
];

for (const cls of forbiddenClasses) {
  check(
    `does NOT contain hardcoded class "${cls}"`,
    !layout.includes(cls)
  );
}

// ─── globals.css assertions ───────────────────────────────────────────────────
console.log('\n[globals.css]');

check(
  'has @tailwind base directive',
  /@tailwind\s+base/.test(css)
);

check(
  'has @tailwind components directive',
  /@tailwind\s+components/.test(css)
);

check(
  'has @tailwind utilities directive',
  /@tailwind\s+utilities/.test(css)
);

check(
  'has @layer base block',
  /@layer\s+base\s*\{/.test(css)
);

check(
  'has :root selector',
  /:root\s*\{/.test(css)
);

check(
  'has .dark selector',
  /\.dark\s*\{/.test(css)
);

check(
  'has CSS custom property --background',
  /--background\s*:/.test(css)
);

check(
  'has CSS custom property --foreground',
  /--foreground\s*:/.test(css)
);

check(
  'has CSS custom property --border',
  /--border\s*:/.test(css)
);

check(
  'has CSS custom property --ring',
  /--ring\s*:/.test(css)
);

check(
  'has CSS custom property --primary',
  /--primary\s*:/.test(css)
);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
