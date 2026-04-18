import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { DualWriter } from '../../src/trace/dual-writer.js';
import { TraceWriter } from '../../src/trace/writer.js';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Finding, CostEvent, GateDecision } from '../../src/schemas/index.js';
import type { Phase } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeRunId(): string {
  return randomUUID();
}

function makePhaseId(): string {
  return randomUUID();
}

function mockPhase(overrides: Partial<Phase> = {}): Phase {
  return {
    id: makePhaseId(),
    runId: makeRunId(),
    name: 'test-phase',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    ...overrides,
  };
}

function makeFinding(runId: string): Finding {
  return {
    id: randomUUID(),
    runId,
    phaseId: randomUUID(),
    severity: 'medium',
    category: 'security',
    title: 'Test finding',
    description: 'A test finding description',
    createdAt: new Date().toISOString(),
  };
}

function makeFindingWithOptionals(runId: string): Finding {
  return {
    id: randomUUID(),
    runId,
    phaseId: randomUUID(),
    agentId: randomUUID(),
    severity: 'high',
    category: 'performance',
    filePath: '/src/foo.ts',
    line: 42,
    title: 'Test finding with optionals',
    description: 'A test finding with optional fields',
    suggestion: 'Fix it',
    owasp: 'A01',
    cwe: 'CWE-79',
    createdAt: new Date().toISOString(),
  };
}

function makeCostEvent(runId: string): CostEvent {
  return {
    id: randomUUID(),
    runId,
    phaseId: randomUUID(),
    agentId: randomUUID(),
    model: 'claude-3-5-sonnet',
    tokensIn: 1000,
    tokensOut: 500,
    costUsd: 0.0025,
    createdAt: new Date().toISOString(),
  };
}

function makeGateDecision(runId: string): GateDecision {
  return {
    id: randomUUID(),
    runId,
    decision: 'pass',
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    policyApplied: 'default',
    decidedAt: new Date().toISOString(),
  };
}

function makeStoreMock(): ForjaStore {
  return {
    createRun: vi.fn(),
    updateRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    createPhase: vi.fn().mockResolvedValue(mockPhase()),
    updatePhase: vi.fn().mockResolvedValue(mockPhase()),
    getPhase: vi.fn(),
    listPhases: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    insertFinding: vi.fn().mockResolvedValue({}),
    insertFindings: vi.fn(),
    listFindings: vi.fn(),
    insertToolCall: vi.fn(),
    insertCostEvent: vi.fn().mockResolvedValue({}),
    costSummaryByPhase: vi.fn(),
    insertGateDecision: vi.fn().mockResolvedValue({}),
    getLatestGateDecision: vi.fn(),
    linkIssue: vi.fn(),
    listIssueLinks: vi.fn(),
    close: vi.fn(),
  };
}

function makeWriterMock(): TraceWriter {
  const runId = makeRunId();
  const mock = {
    write: vi.fn().mockResolvedValue(undefined),
    writePhaseStart: vi.fn().mockResolvedValue(undefined),
    writePhaseEnd: vi.fn().mockResolvedValue(undefined),
    writeToolCall: vi.fn().mockResolvedValue(undefined),
    writeFinding: vi.fn().mockResolvedValue(undefined),
    writeGateDecision: vi.fn().mockResolvedValue(undefined),
    writeCheckpoint: vi.fn().mockResolvedValue(undefined),
    writeError: vi.fn().mockResolvedValue(undefined),
  };
  return mock as unknown as TraceWriter;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DualWriter — both writes succeed', () => {
  it('does not log errors when both JSONL and PG writes succeed', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writePhaseStart('develop');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('DualWriter — JSONL write fails, PG write still happens', () => {
  it('still calls store.createPhase when writer.writePhaseStart rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(writer.writePhaseStart).mockRejectedValue(new Error('JSONL error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writePhaseStart('develop');

    expect(store.createPhase).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[forja:dual-writer] write failed:',
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it('still calls store.insertFinding when writer.writeFinding rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(writer.writeFinding).mockRejectedValue(new Error('JSONL error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writeFinding(makeFinding(runId));

    expect(store.insertFinding).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('still calls store.insertCostEvent when writer.write rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(writer.write).mockRejectedValue(new Error('JSONL error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writeCostEvent(makeCostEvent(runId));

    expect(store.insertCostEvent).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('still calls store.insertGateDecision when writer.writeGateDecision rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(writer.writeGateDecision).mockRejectedValue(new Error('JSONL error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writeGateDecision(makeGateDecision(runId));

    expect(store.insertGateDecision).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('DualWriter — PG write fails, JSONL write still happens', () => {
  it('still calls writer.writePhaseStart when store.createPhase rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(store.createPhase).mockRejectedValue(new Error('PG error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writePhaseStart('develop');

    expect(writer.writePhaseStart).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[forja:dual-writer] write failed:',
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it('still calls writer.writeFinding when store.insertFinding rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(store.insertFinding).mockRejectedValue(new Error('PG error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writeFinding(makeFinding(runId));

    expect(writer.writeFinding).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('still calls writer.write when store.insertCostEvent rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(store.insertCostEvent).mockRejectedValue(new Error('PG error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writeCostEvent(makeCostEvent(runId));

    expect(writer.write).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('still calls writer.writeGateDecision when store.insertGateDecision rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(store.insertGateDecision).mockRejectedValue(new Error('PG error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writeGateDecision(makeGateDecision(runId));

    expect(writer.writeGateDecision).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('DualWriter — errors are logged but never thrown', () => {
  it('does not throw when both JSONL and PG writes fail', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(writer.writePhaseStart).mockRejectedValue(new Error('JSONL error'));
    vi.mocked(store.createPhase).mockRejectedValue(new Error('PG error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(dual.writePhaseStart('develop')).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('logs error with the expected prefix format', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const pgError = new Error('PG connection refused');
    vi.mocked(store.createPhase).mockRejectedValue(pgError);
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await dual.writePhaseStart('develop');

    expect(consoleSpy).toHaveBeenCalledWith('[forja:dual-writer] write failed:', pgError.message);
    consoleSpy.mockRestore();
  });
});

describe('DualWriter — writePhaseStart caches phaseId', () => {
  it('caches the phaseId returned by store.createPhase for later use in writePhaseEnd', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const phaseId = makePhaseId();
    vi.mocked(store.createPhase).mockResolvedValue(mockPhase({ id: phaseId }));
    const dual = new DualWriter(writer, store, runId);

    await dual.writePhaseStart('develop');
    await dual.writePhaseEnd('develop', 'success');

    expect(store.updatePhase).toHaveBeenCalledWith(
      phaseId,
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('passes the correct runId and phase name to store.createPhase', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);

    await dual.writePhaseStart('security', 'agent-1', 'span-1');

    expect(store.createPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        runId,
        name: 'security',
        status: 'running',
        finishedAt: null,
      }),
    );
  });

  it('passes agentId and spanId to writer.writePhaseStart', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const agentId = randomUUID();
    const spanId = randomUUID();

    await dual.writePhaseStart('develop', agentId, spanId);

    expect(writer.writePhaseStart).toHaveBeenCalledWith('develop', agentId, spanId);
  });
});

describe('DualWriter — writePhaseEnd', () => {
  it('calls store.updatePhase with cached phaseId when phase was started', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const phaseId = makePhaseId();
    vi.mocked(store.createPhase).mockResolvedValue(mockPhase({ id: phaseId }));
    const dual = new DualWriter(writer, store, runId);

    await dual.writePhaseStart('develop');
    await dual.writePhaseEnd('develop', 'failed');

    expect(store.updatePhase).toHaveBeenCalledWith(
      phaseId,
      expect.objectContaining({ status: 'failed', finishedAt: expect.any(Date) }),
    );
  });

  it('is a no-op for store when phase was never started (unknown phase)', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);

    await dual.writePhaseEnd('unknown-phase', 'success');

    expect(store.updatePhase).not.toHaveBeenCalled();
    // writer is still called
    expect(writer.writePhaseEnd).toHaveBeenCalledWith('unknown-phase', 'success', undefined);
  });

  it('still calls writer.writePhaseEnd even for unknown phases', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);

    await dual.writePhaseEnd('ghost-phase', 'success', 'span-xyz');

    expect(writer.writePhaseEnd).toHaveBeenCalledWith('ghost-phase', 'success', 'span-xyz');
  });
});

describe('DualWriter — writeFinding maps optional fields to null for store', () => {
  it('maps undefined optional fields to null when calling store.insertFinding', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const finding = makeFinding(runId); // no optional fields

    await dual.writeFinding(finding);

    expect(store.insertFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: null,
        filePath: null,
        line: null,
        suggestion: null,
        owasp: null,
        cwe: null,
      }),
    );
  });

  it('passes provided optional fields through correctly', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const finding = makeFindingWithOptionals(runId);

    await dual.writeFinding(finding);

    expect(store.insertFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: finding.agentId,
        filePath: finding.filePath,
        line: finding.line,
        suggestion: finding.suggestion,
        owasp: finding.owasp,
        cwe: finding.cwe,
      }),
    );
  });

  it('also delegates to writer.writeFinding with the original finding', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const finding = makeFinding(runId);

    await dual.writeFinding(finding, 'span-abc');

    expect(writer.writeFinding).toHaveBeenCalledWith(finding, 'span-abc');
  });
});

describe('DualWriter — writeCostEvent converts costUsd to string for store', () => {
  it('converts costUsd number to string when calling store.insertCostEvent', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const event = makeCostEvent(runId);

    await dual.writeCostEvent(event);

    expect(store.insertCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        costUsd: String(event.costUsd),
      }),
    );
  });

  it('preserves costUsd as number in the JSONL writer payload', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const event = makeCostEvent(runId);

    await dual.writeCostEvent(event);

    expect(writer.write).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ costUsd: event.costUsd }),
      }),
    );
  });

  it('maps null when spanId is absent in cost event store call', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const event = makeCostEvent(runId); // no spanId

    await dual.writeCostEvent(event);

    expect(store.insertCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({ spanId: null }),
    );
  });

  it('passes spanId from cost event when present', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const spanId = randomUUID();
    const event: CostEvent = { ...makeCostEvent(runId), spanId };

    await dual.writeCostEvent(event);

    expect(store.insertCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({ spanId }),
    );
  });
});

describe('DualWriter — writeGateDecision maps optional phaseId to null', () => {
  it('maps undefined phaseId to null in store call', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const decision = makeGateDecision(runId); // no phaseId

    await dual.writeGateDecision(decision);

    expect(store.insertGateDecision).toHaveBeenCalledWith(
      expect.objectContaining({ phaseId: null }),
    );
  });

  it('passes phaseId through when provided', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const phaseId = makePhaseId();
    const decision: GateDecision = { ...makeGateDecision(runId), phaseId };

    await dual.writeGateDecision(decision);

    expect(store.insertGateDecision).toHaveBeenCalledWith(
      expect.objectContaining({ phaseId }),
    );
  });

  it('delegates to writer.writeGateDecision with the original decision and spanId', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const decision = makeGateDecision(runId);

    await dual.writeGateDecision(decision, 'span-xyz');

    expect(writer.writeGateDecision).toHaveBeenCalledWith(decision, 'span-xyz');
  });
});

describe('DualWriter — writeCheckpoint only delegates to TraceWriter', () => {
  it('calls writer.writeCheckpoint with phase and spanId', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);

    await dual.writeCheckpoint('security', 'span-1');

    expect(writer.writeCheckpoint).toHaveBeenCalledWith('security', 'span-1');
  });

  it('does not call any store method for writeCheckpoint', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);

    await dual.writeCheckpoint('review');

    expect(store.createPhase).not.toHaveBeenCalled();
    expect(store.updatePhase).not.toHaveBeenCalled();
    expect(store.insertFinding).not.toHaveBeenCalled();
    expect(store.insertCostEvent).not.toHaveBeenCalled();
    expect(store.insertGateDecision).not.toHaveBeenCalled();
  });
});

describe('DualWriter — writeError only delegates to TraceWriter', () => {
  it('calls writer.writeError with error, phase, and spanId', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);
    const err = new Error('something broke');

    await dual.writeError(err, 'develop', 'span-2');

    expect(writer.writeError).toHaveBeenCalledWith(err, 'develop', 'span-2');
  });

  it('does not call any store method for writeError', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const dual = new DualWriter(writer, store, runId);

    await dual.writeError(new Error('boom'));

    expect(store.createPhase).not.toHaveBeenCalled();
    expect(store.updatePhase).not.toHaveBeenCalled();
    expect(store.insertFinding).not.toHaveBeenCalled();
    expect(store.insertCostEvent).not.toHaveBeenCalled();
    expect(store.insertGateDecision).not.toHaveBeenCalled();
  });

  it('does not throw when writer.writeError rejects', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    vi.mocked(writer.writeError).mockRejectedValue(new Error('IO error'));
    const dual = new DualWriter(writer, store, runId);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(dual.writeError(new Error('original'))).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});

describe('DualWriter — phaseId cache isolation between phases', () => {
  it('correctly maps multiple concurrent phases to their respective phaseIds', async () => {
    const runId = makeRunId();
    const writer = makeWriterMock();
    const store = makeStoreMock();
    const developPhaseId = makePhaseId();
    const testPhaseId = makePhaseId();

    vi.mocked(store.createPhase)
      .mockResolvedValueOnce(mockPhase({ id: developPhaseId, name: 'develop' }))
      .mockResolvedValueOnce(mockPhase({ id: testPhaseId, name: 'test' }));

    const dual = new DualWriter(writer, store, runId);

    await dual.writePhaseStart('develop');
    await dual.writePhaseStart('test');
    await dual.writePhaseEnd('develop', 'success');
    await dual.writePhaseEnd('test', 'failed');

    expect(store.updatePhase).toHaveBeenNthCalledWith(
      1,
      developPhaseId,
      expect.objectContaining({ status: 'success' }),
    );
    expect(store.updatePhase).toHaveBeenNthCalledWith(
      2,
      testPhaseId,
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
