import { build } from 'esbuild';
import { readdirSync, chmodSync, existsSync } from 'fs';
import { join } from 'path';

const hooksDir = 'src/hooks';
const externalDeps = ['pg', 'commander', 'zod', 'js-yaml', 'drizzle-orm'];

await build({
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: externalDeps,
  format: 'esm',
  outfile: 'bin/forja',
  banner: {
    js: '#!/usr/bin/env node',
  },
});

chmodSync('bin/forja', '755');

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
