import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { policiesCommand } from '../policies.js';

const PROJECT_ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../..');
const FIXTURES_LEGACY = resolve(PROJECT_ROOT, 'tests/fixtures/legacy-policies');
const FIXTURES_MIGRATED = resolve(PROJECT_ROOT, 'tests/fixtures/migrated-policies');

// Helper: capture console.log, console.warn, console.error, and process.stdout.write output
async function captureAllOutput(fn: () => Promise<void>): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let capturedExitCode: number | undefined;

  const spyLog = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdoutLines.push(args.map(String).join(' '));
  });
  const spyWarn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    stderrLines.push(args.map(String).join(' '));
  });
  const spyError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderrLines.push(args.map(String).join(' '));
  });
  const spyStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((data: unknown) => {
    stdoutLines.push(String(data));
    return true;
  });
  const spyStderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((data: unknown) => {
    stderrLines.push(String(data));
    return true;
  });
  // Prevent process.exit from killing the test runner
  const spyExit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    capturedExitCode = typeof code === 'number' ? code : code != null ? Number(code) : 0;
    throw new Error(`process.exit(${capturedExitCode})`);
  });

  try {
    await fn();
  } catch (err) {
    // Only swallow errors caused by our process.exit mock
    if (!(err instanceof Error) || !err.message.startsWith('process.exit(')) {
      throw err;
    }
  } finally {
    spyLog.mockRestore();
    spyWarn.mockRestore();
    spyError.mockRestore();
    spyStdoutWrite.mockRestore();
    spyStderrWrite.mockRestore();
    spyExit.mockRestore();
  }

  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    exitCode: capturedExitCode,
  };
}

/**
 * Run `forja policies migrate [args]` via the real Commander command in-process.
 */
async function runMigrate(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  // Reset Commander's internal option/argument state for the migrate subcommand
  const migrateSubcommand = policiesCommand.commands.find((c) => c.name() === 'migrate');
  if (migrateSubcommand) {
    (migrateSubcommand as unknown as { _optionValues: Record<string, unknown> })._optionValues = {};
  }

  return captureAllOutput(async () => {
    await policiesCommand.parseAsync(['migrate', ...args], { from: 'user' });
  });
}

describe('forja policies migrate — integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('--dry-run: exits 0, prints (dry-run), does not write output file', async () => {
    const inputFile = join(FIXTURES_LEGACY, '02-simple-fail.yaml');
    const result = await runMigrate(['--dry-run', '--in', inputFile]);

    const output = result.stdout + result.stderr;

    expect(result.exitCode, 'exit code should be 0 (undefined means no process.exit call)').toBeFalsy();
    expect(output).toContain('(dry-run)');

    // Derived output path would be alongside the input with .dsl.yaml suffix
    const derivedOutput = join(FIXTURES_LEGACY, '02-simple-fail.dsl.yaml');
    expect(existsSync(derivedOutput), 'dry-run must not create output file').toBe(false);
  });

  it('--in + --out: exits 0, creates output file with expected DSL content', async () => {
    const inputFile = join(FIXTURES_LEGACY, '02-simple-fail.yaml');
    const outFile = join(tmpdir(), `forja-migrate-test-${randomUUID()}.yaml`);

    try {
      const result = await runMigrate(['--in', inputFile, '--out', outFile]);

      expect(result.exitCode, `exit code should be 0. stderr: ${result.stderr}`).toBeFalsy();
      expect(existsSync(outFile), 'output file must be created').toBe(true);

      const written = readFileSync(outFile, 'utf-8').trim();
      const expected = readFileSync(join(FIXTURES_MIGRATED, '02-simple-fail.yaml'), 'utf-8').trim();

      expect(written).toBe(expected);
    } finally {
      if (existsSync(outFile)) rmSync(outFile);
    }
  });

  it('non-portable action: exits 0, output contains [non_portable_action] warning', async () => {
    const inputFile = join(FIXTURES_LEGACY, '04-non-portable-action.yaml');
    const outFile = join(tmpdir(), `forja-migrate-test-${randomUUID()}.yaml`);

    try {
      const result = await runMigrate(['--in', inputFile, '--out', outFile]);
      const output = result.stdout + result.stderr;

      expect(result.exitCode, `exit code should be 0. stderr: ${result.stderr}`).toBeFalsy();
      expect(output).toContain('[non_portable_action]');
    } finally {
      if (existsSync(outFile)) rmSync(outFile);
    }
  });

  it('invalid file path: exits with non-zero code', async () => {
    const result = await runMigrate(['--in', '/nonexistent/path.yaml']);

    expect(result.exitCode).toBeTruthy();
    expect(result.exitCode).not.toBe(0);
  });

  it('no args, no policies/ subdir: exits with code 1 or prints "could not read policies directory"', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'forja-migrate-nodir-'));

    // Mock process.cwd() so the command looks for policies/ in the temp dir
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    try {
      const result = await runMigrate([]);
      const output = (result.stdout + result.stderr).toLowerCase();

      // Either exits with non-zero (no policies dir) or prints a "no files" message
      const exitedNonZero = result.exitCode != null && result.exitCode !== 0;
      const noFilesMessage =
        output.includes('no legacy policy files found') ||
        output.includes('could not read policies directory');

      expect(exitedNonZero || noFilesMessage, `got stdout="${result.stdout}" stderr="${result.stderr}" exitCode=${result.exitCode}`).toBe(true);
    } finally {
      cwdSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
