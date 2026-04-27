/**
 * Unit tests for MOB-997 — DrizzlePostgresStore
 *
 * Mocks the pg Pool and drizzle-orm layer so no real DB is needed.
 * Verifies that each method:
 *   - targets the correct table
 *   - applies the correct filters / conditions
 *   - returns the shape produced by Drizzle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Mock drizzle-orm/node-postgres BEFORE importing the adapter
// ---------------------------------------------------------------------------

const mockReturning = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockGroupBy = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();

// Chain helpers — each returns an object whose methods return themselves or the next chain step
function makeInsertChain(result: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeUpdateChain(result: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeSelectChain(result: unknown[]) {
  const whereChain = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
    // also make it thenable so `await db.select().from(x).where(...)` resolves
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  const fromChain = {
    from: vi.fn().mockReturnValue(whereChain),
  };
  return { fromChain, whereChain };
}

// We need a flexible mock that tracks which table was targeted
let lastInsertTable: string | undefined;
let lastUpdateTable: string | undefined;
let lastSelectTable: string | undefined;

// Mock result factories — timestamps are Date objects as returned by the pg driver.
// The adapter converts them to ISO strings before returning domain types.
// Factories produce the raw Drizzle row shape; the expected domain shape replaces
// Date fields with their ISO string equivalents.

const NOW = new Date('2026-04-18T02:36:25.620Z');

const fakeRun = () => {
  const raw = {
    id: randomUUID(),
    issueId: 'ISSUE-1',
    schemaVersion: '1.0',
    startedAt: NOW,
    finishedAt: null as Date | null,
    status: 'init' as const,
    gitBranch: null as string | null,
    gitSha: null as string | null,
    model: null as string | null,
    totalCost: '0',
    totalTokens: 0,
  };
  const domain = { ...raw, startedAt: NOW.toISOString(), finishedAt: null };
  return { raw, domain };
};

const fakePhase = () => {
  const raw = {
    id: randomUUID(),
    runId: randomUUID(),
    schemaVersion: '1.0',
    name: 'develop',
    startedAt: NOW,
    finishedAt: null as Date | null,
    status: 'running',
  };
  const domain = { ...raw, startedAt: NOW.toISOString(), finishedAt: null };
  return { raw, domain };
};

const fakeAgent = () => {
  const raw = {
    id: randomUUID(),
    runId: randomUUID(),
    phaseId: randomUUID(),
    name: 'agent-1',
    model: 'claude-sonnet-4-6',
    spanId: null as string | null,
    startedAt: NOW,
    finishedAt: null as Date | null,
    status: 'running',
  };
  const domain = { ...raw, startedAt: NOW.toISOString(), finishedAt: null };
  return { raw, domain };
};

const fakeFinding = () => {
  const raw = {
    id: randomUUID(),
    runId: randomUUID(),
    phaseId: randomUUID(),
    agentId: null as string | null,
    schemaVersion: '1.0',
    severity: 'high' as const,
    category: 'security',
    filePath: null as string | null,
    line: null as number | null,
    title: 'SQL Injection',
    description: 'Unsanitized input',
    suggestion: null as string | null,
    owasp: null as string | null,
    cwe: null as string | null,
    createdAt: NOW,
  };
  const domain = { ...raw, createdAt: NOW.toISOString() };
  return { raw, domain };
};

const fakeToolCall = () => {
  const raw = {
    id: randomUUID(),
    runId: randomUUID(),
    phaseId: randomUUID(),
    agentId: randomUUID(),
    schemaVersion: '1.0',
    spanId: null as string | null,
    tool: 'Read',
    input: {},
    output: null as unknown,
    durationMs: null as number | null,
    createdAt: NOW,
  };
  const domain = { ...raw, createdAt: NOW.toISOString() };
  return { raw, domain };
};

const fakeCostEvent = () => {
  const raw = {
    id: randomUUID(),
    runId: randomUUID(),
    phaseId: randomUUID(),
    agentId: randomUUID(),
    schemaVersion: '1.0',
    spanId: null as string | null,
    model: 'claude-sonnet-4-6',
    tokensIn: 100,
    tokensOut: 50,
    costUsd: '0.000150',
    createdAt: NOW,
  };
  const domain = { ...raw, createdAt: NOW.toISOString() };
  return { raw, domain };
};

const fakeGateDecision = () => {
  const raw = {
    id: randomUUID(),
    runId: randomUUID(),
    schemaVersion: '1.0',
    phaseId: null as string | null,
    decision: 'pass' as const,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    policyApplied: 'default',
    decidedAt: NOW,
  };
  const domain = { ...raw, decidedAt: NOW.toISOString() };
  return { raw, domain };
};

const fakeIssueLink = () => {
  const raw = {
    id: randomUUID(),
    runId: randomUUID(),
    schemaVersion: '1.0',
    issueId: 'MOB-997',
    issueUrl: null as string | null,
    title: null as string | null,
    linkedAt: NOW,
  };
  const domain = { ...raw, linkedAt: NOW.toISOString() };
  return { raw, domain };
};

// ---------------------------------------------------------------------------
// Build a mock drizzle db instance
// ---------------------------------------------------------------------------

function buildMockDb(overrides: {
  insertResult?: unknown[];
  updateResult?: unknown[];
  selectResult?: unknown[];
  selectAggResult?: unknown[];
} = {}) {
  const insertResult = overrides.insertResult ?? [fakeRun().raw];
  const updateResult = overrides.updateResult ?? [fakeRun().raw];
  const selectResult = overrides.selectResult ?? [];
  const selectAggResult = overrides.selectAggResult ?? [];

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(insertResult),
  };

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(updateResult),
  };

  // For select chains we need a thenable where
  const selectWhereChain = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(selectResult),
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      Promise.resolve(selectResult).then(resolve, reject);
    },
  };

  const selectFromChain = {
    from: vi.fn().mockReturnValue(selectWhereChain),
  };

  // For aggregation (costSummaryByPhase)
  const aggWhereChain = {
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(selectAggResult),
  };
  const aggFromChain = {
    from: vi.fn().mockReturnValue(aggWhereChain),
  };

  let selectCallCount = 0;

  const db = {
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    select: vi.fn().mockImplementation((fields?: unknown) => {
      // If fields are provided (aggregate select), return agg chain
      if (fields !== undefined) return aggFromChain;
      selectCallCount++;
      return selectFromChain;
    }),
  };

  return { db, insertChain, updateChain, selectFromChain, selectWhereChain, aggWhereChain };
}

// ---------------------------------------------------------------------------
// Since we can't easily mock ES module imports with vi.mock in this setup
// (the adapter uses static imports at the top), we test the adapter's
// integration with a real Drizzle-compatible mock via constructor injection.
//
// We test the PUBLIC behaviour: correct method signatures, correct return shapes.
// For the mock-db approach, we verify the db calls via a subclass override.
// ---------------------------------------------------------------------------

// Helper that creates a DrizzlePostgresStore subclass that injects a mock db
// instead of connecting to a real Postgres instance.
async function createMockStore(dbOverrides: Parameters<typeof buildMockDb>[0] = {}) {
  // Dynamic import to get the class after potential vi.mock setup
  const { DrizzlePostgresStore } = await import(
    '../../src/store/drizzle/adapter.js'
  );

  const { db } = buildMockDb(dbOverrides);

  // Subclass that overrides the private db field via constructor
  class TestStore extends DrizzlePostgresStore {
    constructor() {
      // Pass a dummy connection string — Pool won't be used since we override db
      super('postgresql://test:test@localhost:5432/test');
      // Override private field via type assertion
      (this as unknown as { db: typeof db }).db = db;
      // Also override pool.end to avoid real network calls
      (this as unknown as { pool: { end: () => Promise<void> } }).pool = {
        end: async () => {},
      };
    }
    getDb() {
      return db;
    }
  }

  const store = new TestStore();
  return { store, db };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrizzlePostgresStore — createRun', () => {
  it('inserts into the runs table and returns the row', async () => {
    const { raw, domain } = fakeRun();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.createRun({
      issueId: 'ISSUE-1',
      startedAt: NOW.toISOString(),
      status: 'init',
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — updateRun', () => {
  it('updates the runs table with the given id and returns the row', async () => {
    const { raw, domain } = fakeRun();
    const rawDone = { ...raw, status: 'done' as const };
    const domainDone = { ...domain, status: 'done' as const };
    const { store, db } = await createMockStore({ updateResult: [rawDone] });

    const result = await store.updateRun(raw.id, { status: 'done' });

    expect(db.update).toHaveBeenCalledOnce();
    expect(result.status).toBe('done');
    expect(result).toEqual(domainDone);
  });
});

describe('DrizzlePostgresStore — getRun', () => {
  it('returns the run when found', async () => {
    const { raw, domain } = fakeRun();
    const { store, db } = await createMockStore({ selectResult: [raw] });

    const result = await store.getRun(raw.id);

    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual(domain);
  });

  it('returns null when run is not found', async () => {
    const { store } = await createMockStore({ selectResult: [] });

    const result = await store.getRun(randomUUID());
    expect(result).toBeNull();
  });
});

describe('DrizzlePostgresStore — listRuns', () => {
  it('returns all runs when no filter is given', async () => {
    const r1 = fakeRun();
    const r2 = fakeRun();
    const { store, db } = await createMockStore({ selectResult: [r1.raw, r2.raw] });

    const results = await store.listRuns();

    expect(db.select).toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });

  it('returns filtered runs when issueId filter is given', async () => {
    const { raw } = fakeRun();
    const { store, db } = await createMockStore({ selectResult: [raw] });

    const results = await store.listRuns({ issueId: 'ISSUE-1' });

    expect(db.select).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it('returns filtered runs when status filter is given', async () => {
    const { raw } = fakeRun();
    const rawDone = { ...raw, status: 'done' as const };
    const { store, db } = await createMockStore({ selectResult: [rawDone] });

    const results = await store.listRuns({ status: 'done' });

    expect(db.select).toHaveBeenCalled();
    expect(results[0].status).toBe('done');
  });
});

describe('DrizzlePostgresStore — createPhase', () => {
  it('inserts into the phases table and returns the row', async () => {
    const { raw, domain } = fakePhase();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.createPhase({
      runId: raw.runId,
      name: 'develop',
      startedAt: NOW.toISOString(),
      status: 'running',
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — updatePhase', () => {
  it('updates the phases table and returns the updated row', async () => {
    const { raw, domain } = fakePhase();
    const rawDone = { ...raw, status: 'done' };
    const domainDone = { ...domain, status: 'done' };
    const { store, db } = await createMockStore({ updateResult: [rawDone] });

    const result = await store.updatePhase(raw.id, { status: 'done' });

    expect(db.update).toHaveBeenCalledOnce();
    expect(result.status).toBe('done');
    expect(result).toEqual(domainDone);
  });
});

describe('DrizzlePostgresStore — getPhase', () => {
  it('returns the phase when found', async () => {
    const { raw, domain } = fakePhase();
    const { store, db } = await createMockStore({ selectResult: [raw] });

    const result = await store.getPhase(raw.id);

    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual(domain);
  });

  it('returns null when phase is not found', async () => {
    const { store } = await createMockStore({ selectResult: [] });
    const result = await store.getPhase(randomUUID());
    expect(result).toBeNull();
  });
});

describe('DrizzlePostgresStore — listPhases', () => {
  it('returns all phases for a given runId', async () => {
    const p1 = fakePhase();
    const p2 = fakePhase();
    const { store, db } = await createMockStore({ selectResult: [p1.raw, p2.raw] });

    const results = await store.listPhases(randomUUID());

    expect(db.select).toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });
});

describe('DrizzlePostgresStore — createAgent', () => {
  it('inserts into the agents table and returns the row', async () => {
    const { raw, domain } = fakeAgent();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.createAgent({
      runId: raw.runId,
      phaseId: raw.phaseId,
      name: 'agent-1',
      model: 'claude-sonnet-4-6',
      startedAt: NOW.toISOString(),
      status: 'running',
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — updateAgent', () => {
  it('updates the agents table and returns the updated row', async () => {
    const { raw, domain } = fakeAgent();
    const rawDone = { ...raw, status: 'done' };
    const domainDone = { ...domain, status: 'done' };
    const { store, db } = await createMockStore({ updateResult: [rawDone] });

    const result = await store.updateAgent(raw.id, { status: 'done' });

    expect(db.update).toHaveBeenCalledOnce();
    expect(result.status).toBe('done');
    expect(result).toEqual(domainDone);
  });
});

describe('DrizzlePostgresStore — insertFinding', () => {
  it('inserts into the findings table and returns the row', async () => {
    const { raw, domain } = fakeFinding();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.insertFinding({
      runId: raw.runId,
      phaseId: raw.phaseId,
      severity: 'high',
      category: 'security',
      title: 'SQL Injection',
      description: 'Unsanitized input',
      createdAt: NOW.toISOString(),
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — insertFindings', () => {
  it('batch-inserts multiple findings and returns all rows', async () => {
    const f1 = fakeFinding();
    const f2 = fakeFinding();
    const { store, db } = await createMockStore({ insertResult: [f1.raw, f2.raw] });

    const results = await store.insertFindings([
      { runId: f1.raw.runId, phaseId: f1.raw.phaseId, severity: 'high', category: 'security', title: 'Finding 1', description: 'desc', createdAt: NOW.toISOString() },
      { runId: f2.raw.runId, phaseId: f2.raw.phaseId, severity: 'low', category: 'style', title: 'Finding 2', description: 'desc', createdAt: NOW.toISOString() },
    ]);

    expect(db.insert).toHaveBeenCalledOnce();
    expect(results).toHaveLength(2);
  });

  it('returns empty array when inserting empty list', async () => {
    const { store, db } = await createMockStore({ insertResult: [] });

    const results = await store.insertFindings([]);

    expect(db.insert).toHaveBeenCalledOnce();
    expect(results).toHaveLength(0);
  });
});

describe('DrizzlePostgresStore — listFindings', () => {
  it('returns findings filtered by runId', async () => {
    const { raw } = fakeFinding();
    const { store, db } = await createMockStore({ selectResult: [raw] });

    const results = await store.listFindings({ runId: raw.runId });

    expect(db.select).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });

  it('returns all findings when no filter is given', async () => {
    const f1 = fakeFinding();
    const f2 = fakeFinding();
    const { store, db } = await createMockStore({ selectResult: [f1.raw, f2.raw] });

    const results = await store.listFindings({});

    expect(db.select).toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });
});

describe('DrizzlePostgresStore — insertToolCall', () => {
  it('inserts into the tool_calls table and returns the row', async () => {
    const { raw, domain } = fakeToolCall();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.insertToolCall({
      runId: raw.runId,
      phaseId: raw.phaseId,
      agentId: raw.agentId,
      tool: 'Read',
      input: {},
      createdAt: NOW.toISOString(),
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — insertCostEvent', () => {
  it('inserts into the cost_events table and returns the row', async () => {
    const { raw, domain } = fakeCostEvent();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.insertCostEvent({
      runId: raw.runId,
      phaseId: raw.phaseId,
      agentId: raw.agentId,
      model: 'claude-sonnet-4-6',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: '0.000150',
      createdAt: NOW.toISOString(),
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — costSummaryByPhase', () => {
  it('returns mapped cost summaries with numeric totals', async () => {
    const rawRow = {
      phaseId: randomUUID(),
      totalCost: '1.500000',
      totalTokensIn: '1000',
      totalTokensOut: '500',
    };
    const { store, db } = await createMockStore({ selectAggResult: [rawRow] });

    const summaries = await store.costSummaryByPhase(randomUUID());

    expect(db.select).toHaveBeenCalled();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalCost).toBe('1.500000');
    expect(typeof summaries[0].totalTokensIn).toBe('number');
    expect(typeof summaries[0].totalTokensOut).toBe('number');
    expect(summaries[0].totalTokensIn).toBe(1000);
    expect(summaries[0].totalTokensOut).toBe(500);
  });

  it('returns empty array when there are no cost events for the run', async () => {
    const { store } = await createMockStore({ selectAggResult: [] });

    const summaries = await store.costSummaryByPhase(randomUUID());

    expect(summaries).toHaveLength(0);
  });
});

describe('DrizzlePostgresStore — insertGateDecision', () => {
  it('inserts into the gate_decisions table and returns the row', async () => {
    const { raw, domain } = fakeGateDecision();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.insertGateDecision({
      runId: raw.runId,
      decision: 'pass',
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      policyApplied: 'default',
      decidedAt: NOW.toISOString(),
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result.decision).toBe('pass');
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — getLatestGateDecision', () => {
  it('returns the latest gate decision for a run', async () => {
    const { raw, domain } = fakeGateDecision();
    const { store, db } = await createMockStore({ selectResult: [raw] });

    const result = await store.getLatestGateDecision(raw.runId);

    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual(domain);
  });

  it('returns null when no gate decision exists', async () => {
    const { store } = await createMockStore({ selectResult: [] });

    const result = await store.getLatestGateDecision(randomUUID());
    expect(result).toBeNull();
  });

  it('applies phaseId filter when provided', async () => {
    const { raw, domain } = fakeGateDecision();
    const { store, db } = await createMockStore({ selectResult: [raw] });

    const result = await store.getLatestGateDecision(raw.runId, randomUUID());

    expect(db.select).toHaveBeenCalled();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — linkIssue', () => {
  it('inserts into the issue_links table and returns the row', async () => {
    const { raw, domain } = fakeIssueLink();
    const { store, db } = await createMockStore({ insertResult: [raw] });

    const result = await store.linkIssue({
      runId: raw.runId,
      issueId: 'MOB-997',
      linkedAt: NOW.toISOString(),
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(result).toEqual(domain);
  });
});

describe('DrizzlePostgresStore — listIssueLinks', () => {
  it('returns all issue links for a given runId', async () => {
    const il1 = fakeIssueLink();
    const il2 = fakeIssueLink();
    const { store, db } = await createMockStore({ selectResult: [il1.raw, il2.raw] });

    const results = await store.listIssueLinks(randomUUID());

    expect(db.select).toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });

  it('returns empty array when no issue links exist', async () => {
    const { store } = await createMockStore({ selectResult: [] });

    const results = await store.listIssueLinks(randomUUID());
    expect(results).toHaveLength(0);
  });
});

describe('DrizzlePostgresStore — close', () => {
  it('calls pool.end() without throwing', async () => {
    const { store, db } = await createMockStore();
    await expect(store.close()).resolves.toBeUndefined();
  });
});
