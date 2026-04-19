import { afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const createdRunIds: string[] = [];

export function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

afterEach(async () => {
  await Promise.all(
    createdRunIds.splice(0).map(id =>
      fs.rm(path.join('forja', 'state', 'runs', id), { recursive: true, force: true }).catch(() => {}),
    ),
  );
});

export function tracePath(runId: string): string {
  return path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
}

export function costPath(runId: string): string {
  return path.join('forja', 'state', 'runs', runId, 'cost.jsonl');
}
