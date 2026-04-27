/**
 * Integration tests for MOB-999 — DualWriter and checkConsistency against a real Postgres DB.
 *
 * These tests are SKIPPED when CI=true to avoid requiring a database in CI.
 * To run locally: ensure DATABASE_URL is set and schema migrations have been applied.
 *
 * Example:
 *   DATABASE_URL=postgresql://forja:forja@localhost:5432/forja npm test tests/store/dual-writer.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SKIP_IN_CI = process.env.CI === 'true';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://forja:forja@localhost:5432/forja';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getStore(connectionString = DB_URL) {
  const { DrizzlePostgresStore } = await import('../../src/store/drizzle/adapter.js');
  return new DrizzlePostgresStore(connectionString);
}

async function getWriter(runId: string) {
  const { TraceWriter } = await import('../../src/trace/writer.js');
  return new TraceWriter(runId);
}

async function getDualWriter(runId: string, store: Awaited<ReturnType<typeof getStore>>) {
  const { DualWriter } = await import('../../src/trace/dual-writer.js');
  const writer = await getWriter(runId);
  return new DualWriter(writer, store, runId);
}

/** Remove the JSONL trace file produced during a test run. */
async function cleanupTrace(runId: string) {
  const tracePath = path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
  await fs.rm(path.dirname(tracePath), { recursive: true, force: true });
}

function makeRunData() {
  return {
    issueId: `ISSUE-${randomUUID().slice(0, 8)}`,
    startedAt: new Date(),
    status: 'init' as const,
  };
}

function makePhaseData(runId: string, name = 'develop') {
  return {
    runId,
    name,
    startedAt: new Date() as unknown as string,
    finishedAt: null,
    status: 'running',
  };
}

function makeAgentData(runId: string, phaseId: string) {
  return {
    runId,
    phaseId,
    name: 'test-agent',
    model: 'claude-sonnet-4-6',
    spanId: null,
    startedAt: new Date() as unknown as string,
    finishedAt: null,
    status: 'running',
  };
}

function makeFinding(runId: string, phaseId: string) {
  return {
    id: randomUUID(),
    runId,
    phaseId,
    severity: 'high' as const,
    category: 'security',
    title: 'Test finding',
    description: 'Integration test finding',
    createdAt: new Date().toISOString(),
  };
}

function makeCostEvent(runId: string, phaseId: string, agentId: string) {
  return {
    id: randomUUID(),
    runId,
    phaseId,
    agentId,
    model: 'claude-sonnet-4-6',
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.0045,
    createdAt: new Date().toISOString(),
  };
}

function makeGateDecision(runId: string) {
  return {
    id: randomUUID(),
    runId,
    decision: 'pass' as const,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    policyApplied: 'default',
    decidedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_IN_CI)('DualWriter — integration', () => {
  let store: Awaited<ReturnType<typeof getStore>>;
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    store = await getStore();
  });

  afterAll(async () => {
    await store.close();
    // Clean up any JSONL trace files left by the tests
    for (const runId of createdRunIds) {
      await cleanupTrace(runId);
    }
  });

  // -------------------------------------------------------------------------
  // Happy path: full run produces identical counts in JSONL and Postgres
  // -------------------------------------------------------------------------

  describe('full run consistency', () => {
    it('checkConsistency returns ok=true after a complete dual-write sequence', async () => {
      const { checkConsistency } = await import('../../src/store/consistency.js');

      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);

      // 1 phase_start
      await dualWriter.writePhaseStart('develop');
      // 1 finding
      const phaseId = (await store.listPhases(run.id))[0]?.id ?? randomUUID();
      await dualWriter.writeFinding(makeFinding(run.id, phaseId));
      // 1 cost event (needs a real agent for FK constraint)
      const agent = await store.createAgent(makeAgentData(run.id, phaseId));
      await dualWriter.writeCostEvent(makeCostEvent(run.id, phaseId, agent.id));
      // 1 gate decision
      await dualWriter.writeGateDecision(makeGateDecision(run.id));

      // JSONL: phase_start(1) + finding(1) + cost(1) + gate(1) = 4
      // PG:    phases(1)      + findings(1) + cost_events(1) + gate_decisions(1) = 4
      const result = await checkConsistency(run.id);

      expect(result.jsonlCount).toBe(4);
      expect(result.pgCount).toBe(4);
      expect(result.ok).toBe(true);
    });

    it('checkConsistency counts correctly with multiple findings and cost events', async () => {
      const { checkConsistency } = await import('../../src/store/consistency.js');

      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);

      await dualWriter.writePhaseStart('security');
      const phases = await store.listPhases(run.id);
      const phaseId = phases[0]?.id ?? randomUUID();

      // 2 findings
      await dualWriter.writeFinding(makeFinding(run.id, phaseId));
      await dualWriter.writeFinding({ ...makeFinding(run.id, phaseId), severity: 'medium' });
      // 2 cost events (needs a real agent for FK constraint)
      const agent2 = await store.createAgent(makeAgentData(run.id, phaseId));
      await dualWriter.writeCostEvent(makeCostEvent(run.id, phaseId, agent2.id));
      await dualWriter.writeCostEvent(makeCostEvent(run.id, phaseId, agent2.id));
      // 1 gate
      await dualWriter.writeGateDecision(makeGateDecision(run.id));

      // phase_start(1) + finding(2) + cost(2) + gate(1) = 6
      const result = await checkConsistency(run.id);

      expect(result.jsonlCount).toBe(6);
      expect(result.pgCount).toBe(6);
      expect(result.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Graceful degradation: Postgres unavailable
  // -------------------------------------------------------------------------

  describe('graceful degradation — Postgres unavailable', () => {
    it('writePhaseStart does not throw when PG is down, and JSONL is still written', async () => {
      const badStore = await getStore('postgresql://bad:bad@localhost:19999/nodb');
      const runId = randomUUID();
      createdRunIds.push(runId);

      const { DualWriter } = await import('../../src/trace/dual-writer.js');
      const { TraceWriter } = await import('../../src/trace/writer.js');
      const writer = new TraceWriter(runId);
      const dualWriter = new DualWriter(writer, badStore, runId);

      // Should not throw — DualWriter uses Promise.allSettled internally
      await expect(dualWriter.writePhaseStart('develop')).resolves.toBeUndefined();

      // JSONL file should still exist and contain the phase_start event
      const tracePath = path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
      const content = await fs.readFile(tracePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
        .filter((l) => { try { return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header'; } catch { return false; } });
      expect(lines).toHaveLength(1);

      const event = JSON.parse(lines[0]) as { eventType: string };
      expect(event.eventType).toBe('phase_start');

      await badStore.close().catch(() => {});
    });

    it('writeFinding does not throw when PG is down, and JSONL is still written', async () => {
      const badStore = await getStore('postgresql://bad:bad@localhost:19999/nodb');
      const runId = randomUUID();
      createdRunIds.push(runId);

      const { DualWriter } = await import('../../src/trace/dual-writer.js');
      const { TraceWriter } = await import('../../src/trace/writer.js');
      const writer = new TraceWriter(runId);
      const dualWriter = new DualWriter(writer, badStore, runId);

      const phaseId = randomUUID();
      await expect(dualWriter.writeFinding(makeFinding(runId, phaseId))).resolves.toBeUndefined();

      const tracePath = path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
      const content = await fs.readFile(tracePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
        .filter((l) => { try { return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header'; } catch { return false; } });
      expect(lines).toHaveLength(1);

      const event = JSON.parse(lines[0]) as { eventType: string };
      expect(event.eventType).toBe('finding');

      await badStore.close().catch(() => {});
    });

    it('checkConsistency returns ok=false when DATABASE_URL is missing', async () => {
      const { checkConsistency } = await import('../../src/store/consistency.js');

      // Write a real JSONL trace so jsonlCount > 0
      const runId = randomUUID();
      createdRunIds.push(runId);

      const { TraceWriter } = await import('../../src/trace/writer.js');
      const writer = new TraceWriter(runId);
      await writer.writePhaseStart('develop');

      // Temporarily unset DATABASE_URL
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const result = await checkConsistency(runId);
        expect(result.pgCount).toBe(0);
        expect(result.ok).toBe(false);
        expect(result.jsonlCount).toBeGreaterThan(0);
      } finally {
        if (originalUrl !== undefined) {
          process.env.DATABASE_URL = originalUrl;
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Graceful degradation: JSONL write fails (read-only path / bad dir)
  // -------------------------------------------------------------------------

  describe('graceful degradation — JSONL writer fails', () => {
    it('writePhaseStart does not throw when JSONL writer errors, and PG is still written', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const { DualWriter } = await import('../../src/trace/dual-writer.js');

      // Create a TraceWriter-shaped stub that always rejects
      const failingWriter = {
        writePhaseStart: () => Promise.reject(new Error('JSONL disk failure')),
        writePhaseEnd: () => Promise.reject(new Error('JSONL disk failure')),
        writeFinding: () => Promise.reject(new Error('JSONL disk failure')),
        writeGateDecision: () => Promise.reject(new Error('JSONL disk failure')),
        write: () => Promise.reject(new Error('JSONL disk failure')),
        writeCheckpoint: () => Promise.reject(new Error('JSONL disk failure')),
        writeError: () => Promise.reject(new Error('JSONL disk failure')),
      } as unknown as import('../../src/trace/writer.js').TraceWriter;

      const dualWriter = new DualWriter(failingWriter, store, run.id);

      // Must not throw — allSettled absorbs the JSONL error
      await expect(dualWriter.writePhaseStart('develop')).resolves.toBeUndefined();

      // PG should still have the phase
      const phases = await store.listPhases(run.id);
      expect(phases).toHaveLength(1);
      expect(phases[0].name).toBe('develop');
    });

    it('writeFinding does not throw when JSONL fails, and finding is in PG', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);
      const phase = await store.createPhase(makePhaseData(run.id));

      const { DualWriter } = await import('../../src/trace/dual-writer.js');

      const failingWriter = {
        writePhaseStart: () => Promise.reject(new Error('JSONL disk failure')),
        writePhaseEnd: () => Promise.reject(new Error('JSONL disk failure')),
        writeFinding: () => Promise.reject(new Error('JSONL disk failure')),
        writeGateDecision: () => Promise.reject(new Error('JSONL disk failure')),
        write: () => Promise.reject(new Error('JSONL disk failure')),
        writeCheckpoint: () => Promise.reject(new Error('JSONL disk failure')),
        writeError: () => Promise.reject(new Error('JSONL disk failure')),
      } as unknown as import('../../src/trace/writer.js').TraceWriter;

      const dualWriter = new DualWriter(failingWriter, store, run.id);

      await expect(dualWriter.writeFinding(makeFinding(run.id, phase.id))).resolves.toBeUndefined();

      const findings = await store.listFindings({ runId: run.id });
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe('Test finding');
    });
  });

  // -------------------------------------------------------------------------
  // Promise.allSettled — non-blocking writes
  // -------------------------------------------------------------------------

  describe('DualWriter uses Promise.allSettled — writes are non-blocking', () => {
    it('both writes are attempted even when the first (JSONL) promise rejects', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const { DualWriter } = await import('../../src/trace/dual-writer.js');

      let writerCalled = false;
      let storeCalled = false;

      // First promise (writer) rejects; second (store stub) should still run
      const failingWriter = {
        writePhaseStart: () => {
          writerCalled = true;
          return Promise.reject(new Error('writer exploded'));
        },
        writePhaseEnd: () => Promise.reject(new Error('writer exploded')),
        writeFinding: () => Promise.reject(new Error('writer exploded')),
        writeGateDecision: () => Promise.reject(new Error('writer exploded')),
        write: () => Promise.reject(new Error('writer exploded')),
        writeCheckpoint: () => Promise.reject(new Error('writer exploded')),
        writeError: () => Promise.reject(new Error('writer exploded')),
      } as unknown as import('../../src/trace/writer.js').TraceWriter;

      const proxyStore: import('../../src/store/interface.js').ForjaStore = {
        ...store,
        createPhase: async (data) => {
          storeCalled = true;
          return store.createPhase(data);
        },
      };

      const dualWriter = new DualWriter(failingWriter, proxyStore, run.id);
      await dualWriter.writePhaseStart('test-phase');

      expect(writerCalled).toBe(true);
      expect(storeCalled).toBe(true);
    });

    it('both writes are attempted even when the second (store) promise rejects', async () => {
      const runId = randomUUID();
      createdRunIds.push(runId);

      const { DualWriter } = await import('../../src/trace/dual-writer.js');
      const { TraceWriter } = await import('../../src/trace/writer.js');

      let writerCalled = false;
      let storeCalled = false;

      const realWriter = new TraceWriter(runId);
      const originalWritePhaseStart = realWriter.writePhaseStart.bind(realWriter);

      const writerStub = {
        ...realWriter,
        writePhaseStart: async (...args: Parameters<typeof originalWritePhaseStart>) => {
          writerCalled = true;
          return originalWritePhaseStart(...args);
        },
      } as unknown as import('../../src/trace/writer.js').TraceWriter;

      const badStore = await getStore('postgresql://bad:bad@localhost:19999/nodb');
      const originalCreatePhase = badStore.createPhase.bind(badStore);
      badStore.createPhase = async (...args) => {
        storeCalled = true;
        return originalCreatePhase(...args);
      };

      const dualWriter = new DualWriter(writerStub, badStore, runId);
      await dualWriter.writePhaseStart('some-phase');

      expect(writerCalled).toBe(true);
      expect(storeCalled).toBe(true);

      await badStore.close().catch(() => {});
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end: write via DualWriter, read back from Postgres
  // -------------------------------------------------------------------------

  describe('end-to-end write and read back from Postgres', () => {
    it('phase written via DualWriter is retrievable from Postgres', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);
      await dualWriter.writePhaseStart('develop');

      const phases = await store.listPhases(run.id);
      expect(phases).toHaveLength(1);
      expect(phases[0].name).toBe('develop');
      expect(phases[0].status).toBe('running');
    });

    it('phase end updates status in Postgres', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);
      await dualWriter.writePhaseStart('develop');
      await dualWriter.writePhaseEnd('develop', 'success');

      const phases = await store.listPhases(run.id);
      expect(phases).toHaveLength(1);
      expect(phases[0].status).toBe('success');
    });

    it('finding written via DualWriter is retrievable from Postgres', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);
      await dualWriter.writePhaseStart('security');
      const phases = await store.listPhases(run.id);
      const phaseId = phases[0].id;

      await dualWriter.writeFinding({
        ...makeFinding(run.id, phaseId),
        title: 'E2E Finding',
        severity: 'critical',
      });

      const findings = await store.listFindings({ runId: run.id });
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe('E2E Finding');
      expect(findings[0].severity).toBe('critical');
    });

    it('cost event written via DualWriter is retrievable from Postgres', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);
      await dualWriter.writePhaseStart('develop');
      const phases = await store.listPhases(run.id);
      const phaseId = phases[0].id;

      // needs a real agent for the cost_events FK constraint
      const agent = await store.createAgent(makeAgentData(run.id, phaseId));
      await dualWriter.writeCostEvent({
        ...makeCostEvent(run.id, phaseId, agent.id),
        tokensIn: 999,
        tokensOut: 333,
      });

      const summaries = await store.costSummaryByPhase(run.id);
      expect(summaries.length).toBeGreaterThanOrEqual(1);
      const phaseSummary = summaries.find((s) => s.phaseId === phaseId);
      expect(phaseSummary).toBeDefined();
      expect(phaseSummary!.totalTokensIn).toBe(999);
    });

    it('gate decision written via DualWriter is retrievable from Postgres', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);
      await dualWriter.writeGateDecision({
        ...makeGateDecision(run.id),
        decision: 'fail',
        criticalCount: 2,
      });

      const latest = await store.getLatestGateDecision(run.id);
      expect(latest).not.toBeNull();
      expect(latest!.decision).toBe('fail');
      expect(latest!.criticalCount).toBe(2);
    });

    it('JSONL trace file is written alongside Postgres records', async () => {
      const run = await store.createRun(makeRunData());
      createdRunIds.push(run.id);

      const dualWriter = await getDualWriter(run.id, store);
      await dualWriter.writePhaseStart('develop');

      const tracePath = path.join('forja', 'state', 'runs', run.id, 'trace.jsonl');
      const content = await fs.readFile(tracePath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
        .filter((l) => { try { return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header'; } catch { return false; } });

      expect(lines.length).toBeGreaterThanOrEqual(1);
      const firstEvent = JSON.parse(lines[0]) as { eventType: string; runId: string };
      expect(firstEvent.eventType).toBe('phase_start');
      expect(firstEvent.runId).toBe(run.id);
    });
  });
});
