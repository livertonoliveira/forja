import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../config/loader.js';

const execFileAsync = promisify(execFile);

export function parseGitRemote(remoteUrl: string): { owner: string; repo: string } | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}

export async function getGitRemoteInfo(): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
    return parseGitRemote(stdout.trim());
  } catch (err) {
    console.warn('[forja] Could not read git remote origin:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function createCheck(options: {
  owner: string;
  repo: string;
  sha: string;
  name: string;
  conclusion: 'success' | 'failure' | 'neutral';
  title: string;
  summary: string;
  detailsUrl?: string;
}): Promise<void> {
  const { owner, repo, sha, name, conclusion, title, summary, detailsUrl } = options;

  const config = await loadConfig();
  const token = config.githubToken;

  if (!token) {
    console.warn('[forja] GITHUB_TOKEN not set — skipping GitHub check');
    return;
  }

  const repoNamePattern = /^[a-zA-Z0-9_.-]{1,100}$/;
  if (!repoNamePattern.test(owner) || !repoNamePattern.test(repo)) {
    console.warn('[forja] Invalid owner/repo in git remote — skipping GitHub check');
    return;
  }

  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    console.warn('[forja] Invalid git SHA — skipping GitHub check');
    return;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/check-runs`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      name,
      head_sha: sha,
      status: 'completed',
      conclusion,
      output: { title, summary },
      details_url: detailsUrl,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.warn(`[forja] GitHub check creation failed: ${response.status} ${response.statusText}`);
  }
}
