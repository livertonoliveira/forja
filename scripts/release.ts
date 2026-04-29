#!/usr/bin/env tsx
/**
 * release.ts — Interactive release orchestration script.
 *
 * Usage:
 *   tsx scripts/release.ts [--dry-run] [--yes] [--bump major|minor|patch] [--allow-branch <name>]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateUpgradeGuide } from './validate-upgrade-guide.ts';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BumpType = 'major' | 'minor' | 'patch';

interface CliArgs {
  dryRun: boolean;
  yes: boolean;
  bump: BumpType | null;
  allowBranch: string;
}

// ---------------------------------------------------------------------------
// Exported helpers (for unit testing)
// ---------------------------------------------------------------------------

export function parseBumpFromCommits(commits: string[]): BumpType {
  let result: BumpType = 'patch';
  for (const msg of commits) {
    if (/^feat(\([^)]*\))?!:/.test(msg)) return 'major';
    if (/^feat(\([^)]*\))?:/.test(msg)) result = 'minor';
  }
  return result;
}

export function computeNextVersion(current: string, bump: BumpType): string {
  const [maj, min, pat] = current.split('.').map(Number);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, args: string[], cwd = ROOT_DIR): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf-8', timeout: 120_000 });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function die(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const bumpIdx = argv.indexOf('--bump');
  const allowBranchIdx = argv.indexOf('--allow-branch');

  let bump: BumpType | null = null;
  if (bumpIdx >= 0) {
    const val = argv[bumpIdx + 1];
    if (val !== 'major' && val !== 'minor' && val !== 'patch') {
      die(`Invalid --bump value: "${val}". Must be major, minor, or patch.`);
    }
    bump = val;
  }

  const allowBranch = allowBranchIdx >= 0 ? argv[allowBranchIdx + 1] : 'main';
  return { dryRun, yes, bump, allowBranch };
}

function getCurrentVersion(): string {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

function getLastTag(): string | null {
  const result = run('git', ['describe', '--tags', '--abbrev=0']);
  return result.code === 0 ? result.stdout : null;
}

function detectBumpType(): BumpType {
  // Check for breaking changes via check-breaking-changes.ts
  const scriptPath = path.join(ROOT_DIR, 'scripts', 'check-breaking-changes.ts');
  const check = run('npx', ['tsx', scriptPath], ROOT_DIR);
  if (check.code === 2) return 'major';

  // Get commits since last tag
  const lastTag = getLastTag();
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const log = run('git', ['log', range, '--format=%s']);
  const commits = log.stdout ? log.stdout.split('\n').filter(Boolean) : [];
  return parseBumpFromCommits(commits);
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  // Step 1: Detect bump type
  const bump = args.bump ?? detectBumpType();

  // Step 2: Compute next version
  const current = getCurrentVersion();
  const nextVersion = computeNextVersion(current, bump);

  process.stdout.write(`Current: ${current} → Next: ${nextVersion} (${bump})\n`);

  // Step 3: Ask for confirmation
  if (!args.yes && !args.dryRun) {
    const ok = await confirm(`Proceed with release v${nextVersion}?`);
    if (!ok) {
      process.stdout.write('Aborted.\n');
      process.exit(0);
    }
  }

  // Step 4: Validate prerequisites

  // 4a. Working tree must be clean
  const status = run('git', ['status', '--porcelain']);
  if (status.stdout.length > 0) die('Working tree is not clean. Commit or stash changes first.');

  // 4b. Must be on allowed branch
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.stdout !== args.allowBranch) {
    die(`Must be on branch '${args.allowBranch}' (currently on '${branch.stdout}'). Use --allow-branch to override.`);
  }

  // 4c. Major: require RFC reference in SEMVER.md
  if (bump === 'major') {
    const semverPath = path.join(ROOT_DIR, 'SEMVER.md');
    const semverContent = fs.existsSync(semverPath) ? fs.readFileSync(semverPath, 'utf-8') : '';
    if (!/RFC:\s*docs\/rfc\/\S+/.test(semverContent)) {
      die('SEMVER.md has no RFC reference (expected: RFC: docs/rfc/XXX)');
    }
    process.stdout.write('RFC reference found in SEMVER.md.\n');
  }

  // 4d. Minor/major: validate upgrade guide exists and has no unfilled placeholders
  if (bump === 'minor' || bump === 'major') {
    const upgradeGuide = path.join(ROOT_DIR, 'docs', 'upgrades', `v${nextVersion}.md`);
    const guideResult = validateUpgradeGuide(upgradeGuide);
    if (!guideResult.ok) {
      die(`Upgrade guide validation failed: ${guideResult.reason}\nCreate and fill docs/upgrades/v${nextVersion}.md before releasing.`);
    }
    process.stdout.write('Upgrade guide validated.\n');
  }

  // 4e. Build core (required before tests that invoke the compiled binary)
  if (args.dryRun) {
    process.stdout.write('[dry-run] Would run: npm run build:core\n');
  } else {
    const buildResult = run('npm', ['run', 'build:core']);
    if (buildResult.code !== 0) die(`Build failed:\n${buildResult.stderr}`);
  }

  // 4f. Run tests
  if (args.dryRun) {
    process.stdout.write('[dry-run] Would run: npm test\n');
  } else {
    const testResult = run('npm', ['test']);
    if (testResult.code !== 0) die('Tests failed. Fix before releasing.');
  }

  // 4g. Typecheck
  if (args.dryRun) {
    process.stdout.write('[dry-run] Would run: npx tsc --noEmit\n');
  } else {
    const tscResult = run('npx', ['tsc', '--noEmit']);
    if (tscResult.code !== 0) die('TypeScript errors found. Fix before releasing.');
  }

  // 4h. Lint
  if (args.dryRun) {
    process.stdout.write('[dry-run] Would run: npx eslint src --ext .ts\n');
  } else {
    const lintResult = run('npx', ['eslint', 'src', '--ext', '.ts']);
    if (lintResult.code !== 0) die('ESLint errors found. Fix before releasing.');
  }

  // Step 5: Execute release
  if (args.dryRun) {
    process.stdout.write(`[dry-run] Would run: npm version ${bump} --no-git-tag-version\n`);
    process.stdout.write(`[dry-run] Would write: VERSION=${nextVersion}\n`);
    process.stdout.write(`[dry-run] Would run: npx tsx scripts/generate-changelog.ts --for ${nextVersion}\n`);
    process.stdout.write(`[dry-run] Would run: git add package.json package-lock.json CHANGELOG.md VERSION\n`);
    process.stdout.write(`[dry-run] Would run: git commit -m "chore: release v${nextVersion}"\n`);
    process.stdout.write(`[dry-run] Would run: git tag -a v${nextVersion} -m "release v${nextVersion}"\n`);
    return;
  }

  const changelogScript = path.join(ROOT_DIR, 'scripts', 'generate-changelog.ts');
  const versionFile = path.join(ROOT_DIR, 'VERSION');

  const steps: Array<{ cmd: string; args: string[] } | (() => void)> = [
    { cmd: 'npm', args: ['version', bump, '--no-git-tag-version'] },
    () => fs.writeFileSync(versionFile, nextVersion + '\n'),
    { cmd: 'npx', args: ['tsx', changelogScript, '--for', nextVersion] },
    { cmd: 'git', args: ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md', 'VERSION'] },
    { cmd: 'git', args: ['commit', '-m', `chore: release v${nextVersion}`] },
    { cmd: 'git', args: ['tag', '-a', `v${nextVersion}`, '-m', `release v${nextVersion}`] },
  ];

  for (const step of steps) {
    if (typeof step === 'function') {
      step();
      continue;
    }
    const result = run(step.cmd, step.args);
    if (result.code !== 0) {
      die(`Command failed: ${step.cmd} ${step.args.join(' ')}\n${result.stderr}`);
    }
  }

  process.stdout.write(`Released v${nextVersion}!\n\nTo publish: git push --follow-tags\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`Unexpected error: ${String(err)}\n`);
    process.exit(1);
  });
}
