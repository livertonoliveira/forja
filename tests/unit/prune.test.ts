import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
    retentionDays: 90,
    source: 'default',
  }),
}));

vi.mock('../../src/store/drizzle/adapter.js', () => ({
  DrizzlePostgresStore: vi.fn().mockImplementation(() => ({
    deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/store/retention.js', () => ({
  pruneRuns: vi.fn(),
}));

import { loadConfig } from '../../src/config/loader.js';
import { DrizzlePostgresStore } from '../../src/store/drizzle/adapter.js';
import { pruneRuns } from '../../src/store/retention.js';
import { pruneCommand } from '../../src/cli/commands/prune.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockDrizzleStore = vi.mocked(DrizzlePostgresStore);
const mockPruneRuns = vi.mocked(pruneRuns);

async function runPruneAction(args: string[]): Promise<{
  logs: string[];
  errors: string[];
  exitCode: number | undefined;
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  // Reset Commander's option state so tests don't bleed into each other
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pruneCommand as any)._optionValues = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pruneCommand as any)._optionValueSources = {};

  const spyLog = vi.spyOn(console, 'log').mockImplementation((...a) => {
    logs.push(a.join(' '));
  });
  const spyError = vi.spyOn(console, 'error').mockImplementation((...a) => {
    errors.push(a.join(' '));
  });
  const spyExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code as number;
    throw new Error(`process.exit(${code})`);
  });

  try {
    await pruneCommand.parseAsync(['node', 'forja', ...args]);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (!msg.startsWith('process.exit(')) {
      throw err;
    }
  } finally {
    spyLog.mockRestore();
    spyError.mockRestore();
    spyExit.mockRestore();
  }

  return { logs, errors, exitCode };
}

describe('pruneCommand — structure', () => {
  it('has name "prune"', () => {
    expect(pruneCommand.name()).toBe('prune');
  });

  it('has a description', () => {
    expect(pruneCommand.description()).toBeTruthy();
  });

  it('has --before option', () => {
    const flags = pruneCommand.options.map((o) => o.flags);
    expect(flags.some((f) => f.includes('--before'))).toBe(true);
  });

  it('has --dry-run option', () => {
    const flags = pruneCommand.options.map((o) => o.flags);
    expect(flags.some((f) => f.includes('--dry-run'))).toBe(true);
  });

  it('--before accepts a <date> argument', () => {
    const beforeOpt = pruneCommand.options.find((o) => o.flags.includes('--before'));
    expect(beforeOpt?.flags).toContain('<date>');
  });
});

describe('pruneCommand — action (mocked store)', () => {
  let storeInstance: { deleteRunsBefore: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    storeInstance = {
      deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockDrizzleStore.mockImplementation(
      () => storeInstance as unknown as InstanceType<typeof DrizzlePostgresStore>,
    );
    mockLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
      retentionDays: 90,
      source: 'default',
    });
    mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('--dry-run flag', () => {
    it('exits 0 (no process.exit called)', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 3, freedBytes: 2048 });
      const { exitCode } = await runPruneAction(['--dry-run']);
      expect(exitCode).toBeUndefined();
    });

    it('prints the dry-run header with the cutoff date', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 2, freedBytes: 512 });
      const { logs } = await runPruneAction(['--dry-run']);
      expect(logs.join('\n')).toContain('Dry run');
    });

    it('output contains "would be removed"', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 5, freedBytes: 10240 });
      const { logs } = await runPruneAction(['--dry-run']);
      expect(logs.join('\n')).toContain('would be removed');
    });

    it('calls pruneRuns with dryRun: true', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });
      await runPruneAction(['--dry-run']);
      expect(mockPruneRuns).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
      );
    });

    it('calls store.close() even in dry-run', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });
      await runPruneAction(['--dry-run']);
      expect(storeInstance.close).toHaveBeenCalledOnce();
    });
  });

  describe('--before with valid ISO date', () => {
    it('exits 0 (no process.exit called)', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 1, freedBytes: 1024 });
      const { exitCode } = await runPruneAction(['--before', '2026-01-01']);
      expect(exitCode).toBeUndefined();
    });

    it('output contains "Pruned"', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 1, freedBytes: 1024 });
      const { logs } = await runPruneAction(['--before', '2026-01-01']);
      expect(logs.join('\n')).toContain('Pruned');
    });

    it('calls pruneRuns with beforeDate matching the provided date', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });
      await runPruneAction(['--before', '2026-01-01']);
      const call = mockPruneRuns.mock.calls[0];
      const opts = call[1] as { beforeDate: Date };
      expect(opts.beforeDate).toBeInstanceOf(Date);
      expect(opts.beforeDate.toISOString()).toContain('2026-01-01');
    });

    it('calls pruneRuns with dryRun: false', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });
      await runPruneAction(['--before', '2026-01-01']);
      expect(mockPruneRuns).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ dryRun: false }),
      );
    });
  });

  describe('--before with invalid date', () => {
    it('exits with code 1', async () => {
      const { exitCode } = await runPruneAction(['--before', 'not-a-date']);
      expect(exitCode).toBe(1);
    });

    it('prints an error message containing the invalid value', async () => {
      const { errors } = await runPruneAction(['--before', 'not-a-date']);
      expect(errors.join('\n')).toContain('not-a-date');
    });

    it('does not call pruneRuns', async () => {
      await runPruneAction(['--before', 'not-a-date']);
      expect(mockPruneRuns).not.toHaveBeenCalled();
    });
  });

  describe('default behavior (no flags)', () => {
    it('exits 0 (no process.exit called)', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });
      const { exitCode } = await runPruneAction([]);
      expect(exitCode).toBeUndefined();
    });

    it('uses retentionDays from config to compute beforeDate', async () => {
      mockLoadConfig.mockResolvedValue({
        storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
        retentionDays: 30,
        source: 'default',
      });
      mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });

      const before = Date.now();
      await runPruneAction([]);
      const after = Date.now();

      const call = mockPruneRuns.mock.calls[0];
      const opts = call[1] as { beforeDate: Date };
      const cutoff = opts.beforeDate.getTime();

      const expected30DaysAgo = before - 30 * 24 * 60 * 60 * 1000;
      expect(cutoff).toBeGreaterThanOrEqual(expected30DaysAgo - 1000);
      expect(cutoff).toBeLessThanOrEqual(after);
    });

    it('output contains "Pruned" on success', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 2, freedBytes: 4096 });
      const { logs } = await runPruneAction([]);
      expect(logs.join('\n')).toContain('Pruned');
    });
  });

  describe('tip message', () => {
    it('prints schedule tip when runs were deleted', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 3, freedBytes: 9999 });
      const { logs } = await runPruneAction([]);
      expect(logs.join('\n')).toContain('schedule prune');
    });

    it('does not print schedule tip when no runs were deleted', async () => {
      mockPruneRuns.mockResolvedValue({ deletedRuns: 0, freedBytes: 0 });
      const { logs } = await runPruneAction([]);
      expect(logs.join('\n')).not.toContain('schedule prune');
    });
  });
});
