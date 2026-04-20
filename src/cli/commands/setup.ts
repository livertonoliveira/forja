import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HOOKS_CONFIG = {
  hooks: {
    PreToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: 'forja hook pre-tool-use' }],
      },
    ],
    PostToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: 'forja hook post-tool-use' }],
      },
    ],
    Stop: [
      {
        hooks: [{ type: 'command', command: 'forja hook stop' }],
      },
    ],
  },
};

function getPackageRoot(): string {
  const binDir = path.dirname(fileURLToPath(import.meta.url));
  // Compiled binary is at bin/forja, so bin/../ = package root
  return path.resolve(binDir, '..');
}

async function isProjectRoot(): Promise<boolean> {
  const markers = ['.git', 'package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'requirements.txt', 'Gemfile', 'composer.json'];
  for (const marker of markers) {
    try {
      await fs.access(marker);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

async function copyCommands(packageRoot: string): Promise<void> {
  const src = path.join(packageRoot, 'commands', 'forja');
  const dest = path.join('.claude', 'commands', 'forja');

  await fs.mkdir(path.join(dest, 'audit'), { recursive: true });

  const copyDir = async (srcDir: string, destDir: string) => {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  };

  await copyDir(src, dest);
}

async function setupClaudeSettings(): Promise<void> {
  const settingsPath = path.join('.claude', 'settings.json');
  await fs.mkdir('.claude', { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    existing = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // file doesn't exist yet
  }

  const merged = { ...existing, ...HOOKS_CONFIG };
  await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2) + '\n');
}

async function appendClaudeMd(packageRoot: string): Promise<void> {
  const forjaMdPath = path.join(packageRoot, 'CLAUDE.forja.md');
  const claudeMdPath = 'CLAUDE.md';

  const forjaContent = await fs.readFile(forjaMdPath, 'utf-8');

  let existing = '';
  try {
    existing = await fs.readFile(claudeMdPath, 'utf-8');
  } catch {
    // file doesn't exist yet
  }

  if (existing.includes('Forja')) {
    console.log('[forja] CLAUDE.md already contains Forja configuration. Skipping.');
    return;
  }

  await fs.writeFile(claudeMdPath, existing + '\n' + forjaContent);
}

async function startPostgres(packageRoot: string): Promise<void> {
  const composeSrc = path.join(packageRoot, 'docker-compose.yml');
  const composeDest = 'docker-compose.forja.yml';

  try {
    await fs.access(composeDest);
    console.log('[forja] docker-compose.forja.yml already exists. Skipping copy.');
  } catch {
    await fs.copyFile(composeSrc, composeDest);
    console.log('[forja] Copied docker-compose.forja.yml');
  }

  console.log('[forja] Starting PostgreSQL...');
  execSync('docker compose -f docker-compose.forja.yml up -d', { stdio: 'inherit' });

  console.log('[forja] Waiting for PostgreSQL to be ready...');
  // Wait up to 30s for healthcheck
  for (let i = 0; i < 30; i++) {
    try {
      execSync('docker compose -f docker-compose.forja.yml exec -T postgres pg_isready -U forja -d forja', { stdio: 'pipe' });
      break;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function runMigrations(): Promise<void> {
  console.log('[forja] Running database migrations...');
  execSync('forja infra migrate', { stdio: 'inherit' });
}

export const setupCommand = new Command('setup')
  .description('Set up Forja in the current project (slash commands + hooks + optional harness)')
  .option('--with-harness', 'Also set up PostgreSQL and run database migrations')
  .option('--skip-claude-md', 'Do not append Forja section to CLAUDE.md')
  .action(async (options: { withHarness?: boolean; skipClaudeMd?: boolean }) => {
    try {
      const inProject = await isProjectRoot();
      if (!inProject) {
        console.error('[forja] No project detected in current directory. Run this from your project root.');
        process.exit(1);
      }

      const packageRoot = getPackageRoot();

      console.log('[forja] Installing slash commands...');
      await copyCommands(packageRoot);
      console.log('[forja] Slash commands installed to .claude/commands/forja/');

      console.log('[forja] Configuring Claude Code hooks...');
      await setupClaudeSettings();
      console.log('[forja] Hooks configured in .claude/settings.json');

      if (!options.skipClaudeMd) {
        await appendClaudeMd(packageRoot);
        console.log('[forja] Forja section added to CLAUDE.md');
      }

      if (options.withHarness) {
        await startPostgres(packageRoot);
        console.log('[forja] PostgreSQL is ready');
        await runMigrations();
        console.log('[forja] Migrations complete');
      }

      console.log('');
      console.log('[forja] Setup complete!');
      console.log('');
      console.log('  Next step: open Claude Code and run /forja:init');
      console.log('');
      if (!options.withHarness) {
        console.log('  To enable persistent state and cost tracking, run:');
        console.log('    forja setup --with-harness');
        console.log('');
      }
    } catch (err) {
      console.error(`[forja] Setup failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });
