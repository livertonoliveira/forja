import { build } from 'esbuild';
import { readFileSync, readdirSync, chmodSync, existsSync } from 'fs';
import { join } from 'path';

const hooksDir = 'src/hooks';
const externalDeps = ['pg', 'commander', 'zod', 'js-yaml', 'drizzle-orm', '@opentelemetry/*'];
const version = readFileSync('VERSION', 'utf-8').trim();

await build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: externalDeps,
  format: 'esm',
  outfile: 'bin/forja.js',
  define: {
    __FORJA_VERSION__: JSON.stringify(version),
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});

chmodSync('bin/forja.js', '755');

await build({
  entryPoints: ['src/plugin/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: externalDeps,
  format: 'esm',
  outfile: 'dist/plugin/index.js',
});

if (existsSync(hooksDir)) {
  const hookFiles = readdirSync(hooksDir).filter(
    (f) => f.endsWith('.ts') && f !== 'index.ts'
  );

  if (hookFiles.length > 0) {
    await build({
      entryPoints: hookFiles.map((f) => join(hooksDir, f)),
      bundle: true,
      platform: 'node',
      target: 'node20',
      external: externalDeps,
      format: 'esm',
      outdir: 'bin/hooks',
    });
  }
}
