import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getActiveRunPath(cwd = process.cwd()): string {
  return path.join(cwd, 'forja', 'state', '.active-run');
}

export async function initActiveRun(issueId?: string): Promise<string> {
  const runId = randomUUID();
  const filePath = getActiveRunPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = issueId ? `${runId}\n${issueId}` : runId;
  await fs.writeFile(filePath, content, 'utf-8');
  return runId;
}

export async function readActiveRun(): Promise<{ runId: string; issueId?: string } | null> {
  try {
    const content = await fs.readFile(getActiveRunPath(), 'utf-8');
    const [runId, issueId] = content.trim().split('\n');
    if (!UUID_RE.test(runId)) return null;
    return { runId, issueId: issueId || undefined };
  } catch {
    return null;
  }
}

export async function clearActiveRun(): Promise<void> {
  try {
    await fs.unlink(getActiveRunPath());
  } catch {
    // not found is fine
  }
}
