import fs from 'node:fs/promises';
import path from 'node:path';
import type { ForjaStore } from './interface.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pruneRuns(
  store: ForjaStore,
  options: { beforeDate: Date; dryRun?: boolean; stateDir?: string }
): Promise<{ deletedRuns: number; freedBytes: number }> {
  const stateDir = options.stateDir ?? path.join(process.cwd(), 'forja', 'state', 'runs');
  const resolvedBase = path.resolve(stateDir);

  const { runIds } = await store.deleteRunsBefore(options.beforeDate, { dryRun: options.dryRun });

  if (runIds.length === 0) return { deletedRuns: 0, freedBytes: 0 };

  if (options.dryRun) return { deletedRuns: runIds.length, freedBytes: 0 };

  let fsBytes = 0;
  for (let i = 0; i < runIds.length; i += 50) {
    const batch = runIds.slice(i, i + 50).filter((id) => UUID_RE.test(id));
    const sizes = await Promise.all(
      batch.map(async (id) => {
        const dirPath = path.join(resolvedBase, id);
        if (!dirPath.startsWith(resolvedBase + path.sep)) return 0;
        const size = await getDirSize(dirPath);
        await fs.rm(dirPath, { recursive: true });
        return size;
      })
    );
    fsBytes += sizes.reduce((a, b) => a + b, 0);
  }

  return { deletedRuns: runIds.length, freedBytes: fsBytes };
}

async function getDirSize(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirSize(full);
      } else {
        const stat = await fs.stat(full);
        total += stat.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}
