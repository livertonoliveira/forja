import { lstatSync, readdirSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';

export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__tests__']);

export function collectFiles(dir: string, signal: AbortSignal): string[] {
  const results: string[] = [];
  try {
    if (signal.aborted) return results;
    const entries = readdirSync(dir);
    for (const name of entries) {
      if (signal.aborted) return results;
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        results.push(...collectFiles(full, signal));
      } else if (stat.isFile() && /\.[jt]s$/.test(name)) {
        results.push(full);
      }
    }
  } catch {
    return [];
  }
  return results;
}

export function validateCwd(cwd: string): void {
  const resolved = resolve(cwd);
  if (!isAbsolute(resolved)) {
    throw new Error(`cwd must resolve to an absolute path, got: ${cwd}`);
  }
}
