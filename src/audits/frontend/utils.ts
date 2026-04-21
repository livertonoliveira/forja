import { lstatSync, readdirSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import type { AuditContext, AuditFinding } from '../../plugin/types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__tests__', '.next', 'out']);

export function collectFrontendFiles(dir: string, signal: AbortSignal): string[] {
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
        results.push(...collectFrontendFiles(full, signal));
      } else if (stat.isFile() && /\.[jt]sx?$/.test(name)) {
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

export function collectAppRouterFiles(ctx: AuditContext): string[] {
  validateCwd(ctx.cwd);
  const appDir = join(ctx.cwd, 'app');
  try {
    return collectFrontendFiles(appDir, ctx.abortSignal);
  } catch {
    const srcAppDir = join(ctx.cwd, 'src', 'app');
    try {
      return collectFrontendFiles(srcAppDir, ctx.abortSignal);
    } catch {
      return [];
    }
  }
}

export function countBySeverity(findings: AuditFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}
