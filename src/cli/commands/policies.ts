import { Command } from 'commander';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join, basename, extname, dirname, resolve } from 'path';
import { migrateLegacyPolicy } from '../../policy/dsl/migrator.js';

function simpleDiff(oldContent: string, newContent: string): void {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      process.stdout.write(` ${o ?? ''}\n`);
    } else {
      if (o !== undefined) process.stdout.write(`\x1b[31m-${o}\x1b[0m\n`);
      if (n !== undefined) process.stdout.write(`\x1b[32m+${n}\x1b[0m\n`);
    }
  }
}

async function migrateFile(
  inputPath: string,
  outputPath: string | undefined,
  dryRun: boolean,
): Promise<void> {
  const content = await readFile(inputPath, 'utf-8');
  const { dsl, warnings } = migrateLegacyPolicy(content);

  for (const w of warnings) {
    console.warn(`[forja] migrate: WARNING [${w.code}] gate="${w.gate}" — ${w.message}`);
  }

  if (dryRun) {
    simpleDiff(content, dsl);
    console.log(`[forja] migrate: (dry-run) ${inputPath}`);
    return;
  }

  const dest = outputPath ?? deriveOutputPath(inputPath);
  await writeFile(dest, dsl, 'utf-8');
  console.log(`[forja] migrate: ${inputPath} → ${dest}`);
}

function deriveOutputPath(inputPath: string): string {
  const dir = dirname(inputPath);
  const name = basename(inputPath, extname(inputPath));
  return join(dir, `${name}.dsl.yaml`);
}

function assertSafePath(userPath: string): string {
  // Block relative paths that traverse above cwd (e.g., ../../etc/passwd)
  const normalized = userPath.replace(/\\/g, '/');
  if (!userPath.startsWith('/') && normalized.split('/').some(p => p === '..')) {
    throw new Error(`Path traversal detected in '${userPath}'`);
  }
  return resolve(userPath);
}

const migrateCommand = new Command('migrate')
  .description('Migrate legacy policy YAML files to DSL format')
  .option('--dry-run', 'Print diff, do not write files')
  .option('--in <path>', 'Specific input file (default: all policies/*.yaml)')
  .option('--out <path>', 'Custom output destination')
  .action(async (opts: { dryRun?: boolean; in?: string; out?: string }) => {
    try {
      const dryRun = opts.dryRun ?? false;
      const outPath = opts.out;

      if (opts.in) {
        await migrateFile(assertSafePath(opts.in), outPath ? assertSafePath(outPath) : undefined, dryRun);
      } else {
        const policiesDir = join(process.cwd(), 'policies');
        let files: string[];
        try {
          const entries = await readdir(policiesDir);
          files = entries
            .filter(f => f.endsWith('.yaml') && !f.endsWith('.dsl.yaml'))
            .map(f => join(policiesDir, f));
        } catch {
          console.error(`[forja] migrate: could not read policies directory at ${policiesDir}`);
          process.exit(1);
          return;
        }

        if (files.length === 0) {
          console.log('[forja] migrate: no legacy policy files found');
          return;
        }

        if (outPath) assertSafePath(outPath);

        if (files.length > 1 && outPath) {
          console.warn('[forja] migrate: --out is ignored when migrating multiple files; each file derives its own output path');
        }

        await Promise.all(files.map(file => migrateFile(file, files.length === 1 ? outPath : undefined, dryRun)));
      }
    } catch (err) {
      process.stderr.write(`[forja] migrate: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

export const policiesCommand = new Command('policies')
  .description('Manage Forja policy files')
  .addCommand(migrateCommand);
