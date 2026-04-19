/**
 * Unit tests for MOB-1013 — src/cli/commands/replay.ts
 *
 * Tests:
 *  - formatPhaseDiff: no changes, added findings, removed findings, gate change, fingerprint change
 *  - formatResult: header, no regressions, with regressions
 *  - replayCommand: invalid UUID for runId, invalid UUID for --compare,
 *                   valid --compare mode, --phases parsed correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — set up before importing modules under test
// ---------------------------------------------------------------------------

vi.mock('../../../src/store/factory.js', () => ({
  createStoreFromConfig: vi.fn(),
}));

vi.mock('../../../src/engine/replay.js', () => ({
  replayRun: vi.fn(),
}));

import { createStoreFromConfig } from '../../../src/store/factory.js';
import { replayRun } from '../../../src/engine/replay.js';
import { formatPhaseDiff, formatResult, replayCommand } from '../../../src/cli/commands/replay.js';
import type { PhaseDiff, ReplayResult } from '../../../src/engine/replay.js';
import type { Finding } from '../../../src/store/types.js';

const mockedCreateStoreFromConfig = vi.mocked(createStoreFromConfig);
const mockedReplayRun = vi.mocked(replayRun);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID_1 = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-001',
    runId: VALID_UUID_1,
    phaseId: 'phase-001',
    agentId: null,
    severity: 'high',
    category: 'security',
    title: 'SQL Injection',
    description: 'SQL injection vulnerability',
    filePath: 'src/db.ts',
    line: 42,
    col: null,
    rule: null,
    effort: null,
    raw: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeNoDiffPhaseDiff(overrides: Partial<PhaseDiff> = {}): PhaseDiff {
  return {
    phase: 'security',
    findingsDiff: { added: [], removed: [], changed: [] },
    gateDecisionChanged: false,
    commandFingerprintChanged: false,
    originalCount: 3,
    originalGate: 'pass',
    replayCount: 3,
    replayGate: 'pass',
    ...overrides,
  };
}

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let processExitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
    throw new Error(`process.exit(${_code})`);
  });
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  processExitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// formatPhaseDiff — pure function tests
// ---------------------------------------------------------------------------

describe('formatPhaseDiff', () => {
  it('emits "same" line with count and gate when no changes', () => {
    const diff = makeNoDiffPhaseDiff({ originalCount: 5, originalGate: 'pass' });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('same');
    expect(output).toContain('5 findings');
    expect(output).toContain('same gate: PASS');
    expect(output).not.toContain('REGRESSION DETECTED');
  });

  it('uses 0 count and "PASS" gate when originalCount and originalGate are undefined', () => {
    const diff = makeNoDiffPhaseDiff({ originalCount: undefined, originalGate: undefined });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('0 findings');
    expect(output).toContain('same gate: PASS');
  });

  it('emits REGRESSION DETECTED with added finding lines', () => {
    const finding = makeFinding({ severity: 'critical', title: 'RCE', filePath: 'src/exec.ts', line: 10 });
    const diff = makeNoDiffPhaseDiff({
      findingsDiff: { added: [finding], removed: [], changed: [] },
    });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('REGRESSION DETECTED');
    expect(output).toContain('+ Added:');
    expect(output).toContain('[critical]');
    expect(output).toContain('RCE');
    expect(output).toContain('src/exec.ts:10');
    expect(output).toContain('(was not in original)');
  });

  it('emits removed finding lines', () => {
    const finding = makeFinding({ severity: 'medium', title: 'XSS', filePath: 'src/render.ts', line: 5 });
    const diff = makeNoDiffPhaseDiff({
      findingsDiff: { added: [], removed: [finding], changed: [] },
    });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('REGRESSION DETECTED');
    expect(output).toContain('- Removed:');
    expect(output).toContain('[medium]');
    expect(output).toContain('XSS');
    expect(output).toContain('src/render.ts:5');
    expect(output).toContain('(was in original)');
  });

  it('uses "unknown location" when finding has no filePath', () => {
    const finding = makeFinding({ filePath: undefined as unknown as string, line: null });
    const diff = makeNoDiffPhaseDiff({
      findingsDiff: { added: [finding], removed: [], changed: [] },
    });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('unknown location');
  });

  it('emits Gate change line when gateDecisionChanged is true', () => {
    const diff = makeNoDiffPhaseDiff({
      gateDecisionChanged: true,
      originalGate: 'pass',
      replayGate: 'fail',
    });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('REGRESSION DETECTED');
    expect(output).toContain('Gate: PASS → FAIL');
  });

  it('emits command fingerprint changed line when commandFingerprintChanged is true', () => {
    const diff = makeNoDiffPhaseDiff({
      commandFingerprintChanged: true,
    });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('REGRESSION DETECTED');
    expect(output).toContain('~ Command fingerprint changed');
  });

  it('formats phase name in uppercase', () => {
    const diff = makeNoDiffPhaseDiff({ phase: 'security' });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('PHASE SECURITY');
  });

  it('omits line number from location when line is null', () => {
    const finding = makeFinding({ filePath: 'src/utils.ts', line: null });
    const diff = makeNoDiffPhaseDiff({
      findingsDiff: { added: [finding], removed: [], changed: [] },
    });
    const output = formatPhaseDiff(diff);
    expect(output).toContain('src/utils.ts');
    expect(output).not.toMatch(/src\/utils\.ts:\d/);
  });
});

// ---------------------------------------------------------------------------
// formatResult — pure function tests
// ---------------------------------------------------------------------------

describe('formatResult', () => {
  it('formats header as "Replay <replayRunId> vs original <originalRunId>"', () => {
    const result: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: false,
    };
    const output = formatResult(result);
    expect(output).toContain(`Replay ${VALID_UUID_2} vs original ${VALID_UUID_1}`);
  });

  it('ends with "RESULT: no regressions detected" when regression is false', () => {
    const result: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: false,
    };
    const output = formatResult(result);
    const lines = output.split('\n');
    expect(lines[lines.length - 1]).toBe('RESULT: no regressions detected');
  });

  it('ends with "RESULT: REGRESSIONS DETECTED" when regression is true', () => {
    const result: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: true,
    };
    const output = formatResult(result);
    const lines = output.split('\n');
    expect(lines[lines.length - 1]).toBe('RESULT: REGRESSIONS DETECTED');
  });

  it('includes formatted diffs for each phase', () => {
    const diff = makeNoDiffPhaseDiff({ phase: 'perf', originalCount: 2, originalGate: 'pass' });
    const result: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [diff],
      regression: false,
    };
    const output = formatResult(result);
    expect(output).toContain('PHASE PERF');
    expect(output).toContain('same');
  });
});

// ---------------------------------------------------------------------------
// replayCommand — CLI validation tests
// ---------------------------------------------------------------------------

describe('replayCommand: invalid UUID for runId', () => {
  it('exits with code 1 when runId is not a valid UUID', async () => {
    await expect(
      replayCommand.parseAsync(['node', 'forja', 'not-a-uuid']),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    const errors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(errors).toContain('invalid run ID format');
  });
});

describe('replayCommand: invalid UUID for --compare', () => {
  it('exits with code 1 when --compare value is not a valid UUID', async () => {
    await expect(
      replayCommand.parseAsync(['node', 'forja', VALID_UUID_1, '--compare', 'bad-uuid']),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    const errors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(errors).toContain('invalid --compare run ID format');
  });
});

describe('replayCommand: valid --compare mode', () => {
  it('calls replayRun with compareWith option when --compare is provided', async () => {
    const fakeStore = { close: vi.fn().mockResolvedValue(undefined) };
    mockedCreateStoreFromConfig.mockResolvedValue(fakeStore as never);

    const fakeResult: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: false,
    };
    mockedReplayRun.mockResolvedValue(fakeResult);

    await replayCommand.parseAsync(['node', 'forja', VALID_UUID_1, '--compare', VALID_UUID_2]);

    expect(mockedReplayRun).toHaveBeenCalledWith(
      fakeStore,
      expect.objectContaining({
        runId: VALID_UUID_1,
        compareWith: VALID_UUID_2,
      }),
    );
  });

  it('does not exit with code 1 when no regression is found', async () => {
    const fakeStore = { close: vi.fn().mockResolvedValue(undefined) };
    mockedCreateStoreFromConfig.mockResolvedValue(fakeStore as never);

    const fakeResult: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: false,
    };
    mockedReplayRun.mockResolvedValue(fakeResult);

    await replayCommand.parseAsync(['node', 'forja', VALID_UUID_1, '--compare', VALID_UUID_2]);

    expect(processExitSpy).not.toHaveBeenCalledWith(1);
  });

  it('exits with code 1 when regression is found', async () => {
    const fakeStore = { close: vi.fn().mockResolvedValue(undefined) };
    mockedCreateStoreFromConfig.mockResolvedValue(fakeStore as never);

    const fakeResult: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: true,
    };
    mockedReplayRun.mockResolvedValue(fakeResult);

    await expect(
      replayCommand.parseAsync(['node', 'forja', VALID_UUID_1, '--compare', VALID_UUID_2]),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});

describe('replayCommand: --phases option', () => {
  it('passes parsed phases as PipelineState[] to replayRun', async () => {
    const fakeStore = { close: vi.fn().mockResolvedValue(undefined) };
    mockedCreateStoreFromConfig.mockResolvedValue(fakeStore as never);

    const fakeResult: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: false,
    };
    mockedReplayRun.mockResolvedValue(fakeResult);

    await replayCommand.parseAsync([
      'node',
      'forja',
      VALID_UUID_1,
      '--phases',
      'perf,security',
    ]);

    expect(mockedReplayRun).toHaveBeenCalledWith(
      fakeStore,
      expect.objectContaining({
        runId: VALID_UUID_1,
        phases: ['perf', 'security'],
      }),
    );
  });

  it('passes undefined phases when --phases is not specified', async () => {
    // Commander retains option state between parseAsync calls on the same instance.
    // Reset _optionValues so prior --phases value does not bleed into this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (replayCommand as any)._optionValues = {};

    const fakeStore = { close: vi.fn().mockResolvedValue(undefined) };
    mockedCreateStoreFromConfig.mockResolvedValue(fakeStore as never);

    const fakeResult: ReplayResult = {
      originalRunId: VALID_UUID_1,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: false,
    };
    mockedReplayRun.mockResolvedValue(fakeResult);

    const RUN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await replayCommand.parseAsync(['node', 'forja', RUN_A]);

    const lastCall = mockedReplayRun.mock.calls[mockedReplayRun.mock.calls.length - 1];
    expect(lastCall[1]).toMatchObject({ runId: RUN_A });
    expect(lastCall[1].phases).toBeUndefined();
  });
});
