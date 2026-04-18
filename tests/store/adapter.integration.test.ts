/**
 * Integration tests for MOB-997 — DrizzlePostgresStore against a real Postgres DB.
 *
 * These tests are SKIPPED when CI=true to avoid requiring a database in CI.
 * To run locally: ensure DATABASE_URL is set to a valid PostgreSQL connection string,
 * and the schema migrations have been applied.
 *
 * Example:
 *   DATABASE_URL=postgresql://postgres:password@localhost:5432/forja_test npm test tests/store/adapter.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

const SKIP_IN_CI = process.env.CI === 'true';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getStore() {
  const { DrizzlePostgresStore } = await import('../../src/store/drizzle/adapter.js');
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/forja_test';
  return new DrizzlePostgresStore(connectionString);
}

function makeRunData() {
  return {
    issueId: `ISSUE-${randomUUID().slice(0, 8)}`,
    startedAt: new Date(),
    status: 'init' as const,
  };
}

function makePhaseData(runId: string) {
  return {
    runId,
    name: 'develop',
    startedAt: new Date(),
    status: 'running',
  };
}

function makeAgentData(runId: string, phaseId: string) {
  return {
    runId,
    phaseId,
    name: 'unit-agent',
    model: 'claude-sonnet-4-6',
    startedAt: new Date(),
    status: 'running',
  };
}

function makeFindingData(runId: string, phaseId: string) {
  return {
    runId,
    phaseId,
    severity: 'high' as const,
    category: 'security',
    title: 'SQL Injection',
    description: 'Unsanitized input passed to query',
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_IN_CI)('DrizzlePostgresStore — integration', () => {
  let store: Awaited<ReturnType<typeof getStore>>;

  beforeAll(async () => {
    store = await getStore();
  });

  afterAll(async () => {
    await store.close();
  });

  // --------------------------------------------------------------------------
  // Runs CRUD
  // --------------------------------------------------------------------------

  describe('runs', () => {
    it('createRun — inserts and returns a run with a generated UUID', async () => {
      const data = makeRunData();
      const run = await store.createRun(data);

      expect(run.id).toBeDefined();
      expect(run.issueId).toBe(data.issueId);
      expect(run.status).toBe('init');
      expect(run.totalTokens).toBe(0);
    });

    it('getRun — retrieves the run that was created', async () => {
      const run = await store.createRun(makeRunData());
      const fetched = await store.getRun(run.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(run.id);
      expect(fetched!.issueId).toBe(run.issueId);
    });

    it('getRun — returns null for a non-existent id', async () => {
      const result = await store.getRun(randomUUID());
      expect(result).toBeNull();
    });

    it('updateRun — updates status and returns updated row', async () => {
      const run = await store.createRun(makeRunData());
      const updated = await store.updateRun(run.id, { status: 'done' });

      expect(updated.id).toBe(run.id);
      expect(updated.status).toBe('done');
    });

    it('listRuns — returns runs filtered by issueId', async () => {
      const issueId = `ISSUE-${randomUUID().slice(0, 8)}`;
      const run1 = await store.createRun({ ...makeRunData(), issueId });
      const run2 = await store.createRun({ ...makeRunData(), issueId });

      const results = await store.listRuns({ issueId });

      const ids = results.map((r) => r.id);
      expect(ids).toContain(run1.id);
      expect(ids).toContain(run2.id);
    });

    it('listRuns — returns runs filtered by status', async () => {
      const run = await store.createRun(makeRunData());
      await store.updateRun(run.id, { status: 'failed' });

      const results = await store.listRuns({ status: 'failed' });

      const ids = results.map((r) => r.id);
      expect(ids).toContain(run.id);
    });
  });

  // --------------------------------------------------------------------------
  // Phases CRUD
  // --------------------------------------------------------------------------

  describe('phases', () => {
    it('createPhase — inserts and returns a phase', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));

      expect(phase.id).toBeDefined();
      expect(phase.runId).toBe(run.id);
      expect(phase.name).toBe('develop');
    });

    it('updatePhase — updates status and returns updated row', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const updated = await store.updatePhase(phase.id, { status: 'done' });

      expect(updated.status).toBe('done');
    });

    it('getPhase — retrieves the phase that was created', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const fetched = await store.getPhase(phase.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(phase.id);
    });

    it('getPhase — returns null for a non-existent id', async () => {
      const result = await store.getPhase(randomUUID());
      expect(result).toBeNull();
    });

    it('listPhases — returns all phases for a run', async () => {
      const run = await store.createRun(makeRunData());
      const phase1 = await store.createPhase({ ...makePhaseData(run.id), name: 'develop' });
      const phase2 = await store.createPhase({ ...makePhaseData(run.id), name: 'test' });

      const results = await store.listPhases(run.id);

      const ids = results.map((p) => p.id);
      expect(ids).toContain(phase1.id);
      expect(ids).toContain(phase2.id);
    });
  });

  // --------------------------------------------------------------------------
  // Agents CRUD
  // --------------------------------------------------------------------------

  describe('agents', () => {
    it('createAgent — inserts and returns an agent', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const agent = await store.createAgent(makeAgentData(run.id, phase.id));

      expect(agent.id).toBeDefined();
      expect(agent.runId).toBe(run.id);
      expect(agent.phaseId).toBe(phase.id);
    });

    it('updateAgent — updates status and returns updated row', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const agent = await store.createAgent(makeAgentData(run.id, phase.id));
      const updated = await store.updateAgent(agent.id, { status: 'done' });

      expect(updated.status).toBe('done');
    });
  });

  // --------------------------------------------------------------------------
  // Findings
  // --------------------------------------------------------------------------

  describe('findings', () => {
    it('insertFinding — inserts and returns a finding', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const finding = await store.insertFinding(makeFindingData(run.id, phase.id));

      expect(finding.id).toBeDefined();
      expect(finding.severity).toBe('high');
      expect(finding.runId).toBe(run.id);
    });

    it('insertFindings — batch-inserts and returns all findings', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));

      const results = await store.insertFindings([
        makeFindingData(run.id, phase.id),
        { ...makeFindingData(run.id, phase.id), severity: 'low' as const, title: 'Minor nit' },
      ]);

      expect(results).toHaveLength(2);
      const severities = results.map((f) => f.severity);
      expect(severities).toContain('high');
      expect(severities).toContain('low');
    });

    it('listFindings — filters by runId', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      await store.insertFinding(makeFindingData(run.id, phase.id));

      const results = await store.listFindings({ runId: run.id });

      expect(results.length).toBeGreaterThanOrEqual(1);
      results.forEach((f) => expect(f.runId).toBe(run.id));
    });

    it('listFindings — filters by severity', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      await store.insertFinding(makeFindingData(run.id, phase.id));
      await store.insertFinding({ ...makeFindingData(run.id, phase.id), severity: 'critical', title: 'Critical finding' });

      const criticals = await store.listFindings({ runId: run.id, severity: 'critical' });

      expect(criticals.every((f) => f.severity === 'critical')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Tool calls
  // --------------------------------------------------------------------------

  describe('toolCalls', () => {
    it('insertToolCall — inserts and returns a tool call', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const agent = await store.createAgent(makeAgentData(run.id, phase.id));

      const tc = await store.insertToolCall({
        runId: run.id,
        phaseId: phase.id,
        agentId: agent.id,
        tool: 'Read',
        input: { path: '/some/file.ts' },
        createdAt: new Date(),
      });

      expect(tc.id).toBeDefined();
      expect(tc.tool).toBe('Read');
    });
  });

  // --------------------------------------------------------------------------
  // Cost events
  // --------------------------------------------------------------------------

  describe('costEvents', () => {
    it('insertCostEvent — inserts and returns a cost event', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const agent = await store.createAgent(makeAgentData(run.id, phase.id));

      const ce = await store.insertCostEvent({
        runId: run.id,
        phaseId: phase.id,
        agentId: agent.id,
        model: 'claude-sonnet-4-6',
        tokensIn: 1000,
        tokensOut: 500,
        costUsd: '0.004500',
        createdAt: new Date(),
      });

      expect(ce.id).toBeDefined();
      expect(Number(ce.tokensIn)).toBe(1000);
    });

    it('costSummaryByPhase — aggregates cost events by phase', async () => {
      const run = await store.createRun(makeRunData());
      const phase = await store.createPhase(makePhaseData(run.id));
      const agent = await store.createAgent(makeAgentData(run.id, phase.id));

      await store.insertCostEvent({
        runId: run.id,
        phaseId: phase.id,
        agentId: agent.id,
        model: 'claude-sonnet-4-6',
        tokensIn: 100,
        tokensOut: 50,
        costUsd: '0.000450',
        createdAt: new Date(),
      });

      await store.insertCostEvent({
        runId: run.id,
        phaseId: phase.id,
        agentId: agent.id,
        model: 'claude-sonnet-4-6',
        tokensIn: 200,
        tokensOut: 100,
        costUsd: '0.000900',
        createdAt: new Date(),
      });

      const summaries = await store.costSummaryByPhase(run.id);

      expect(summaries.length).toBeGreaterThanOrEqual(1);
      const phaseSummary = summaries.find((s) => s.phaseId === phase.id);
      expect(phaseSummary).toBeDefined();
      expect(typeof phaseSummary!.totalTokensIn).toBe('number');
      expect(phaseSummary!.totalTokensIn).toBeGreaterThanOrEqual(300);
    });
  });

  // --------------------------------------------------------------------------
  // Gate decisions
  // --------------------------------------------------------------------------

  describe('gateDecisions', () => {
    it('insertGateDecision — inserts and returns a gate decision', async () => {
      const run = await store.createRun(makeRunData());

      const gd = await store.insertGateDecision({
        runId: run.id,
        decision: 'pass',
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        policyApplied: 'default',
        decidedAt: new Date(),
      });

      expect(gd.id).toBeDefined();
      expect(gd.decision).toBe('pass');
    });

    it('getLatestGateDecision — returns the most recent gate decision', async () => {
      const run = await store.createRun(makeRunData());

      await store.insertGateDecision({
        runId: run.id,
        decision: 'warn',
        criticalCount: 0,
        highCount: 0,
        mediumCount: 1,
        lowCount: 0,
        policyApplied: 'default',
        decidedAt: new Date(Date.now() - 1000),
      });

      await store.insertGateDecision({
        runId: run.id,
        decision: 'fail',
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        policyApplied: 'default',
        decidedAt: new Date(),
      });

      const latest = await store.getLatestGateDecision(run.id);

      expect(latest).not.toBeNull();
      expect(latest!.decision).toBe('fail');
    });

    it('getLatestGateDecision — returns null when no decisions exist', async () => {
      const run = await store.createRun(makeRunData());
      const result = await store.getLatestGateDecision(run.id);
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Issue links
  // --------------------------------------------------------------------------

  describe('issueLinks', () => {
    it('linkIssue — inserts and returns an issue link', async () => {
      const run = await store.createRun(makeRunData());

      const il = await store.linkIssue({
        runId: run.id,
        issueId: 'MOB-997',
        linkedAt: new Date(),
      });

      expect(il.id).toBeDefined();
      expect(il.issueId).toBe('MOB-997');
    });

    it('listIssueLinks — returns all issue links for a run', async () => {
      const run = await store.createRun(makeRunData());
      await store.linkIssue({ runId: run.id, issueId: 'MOB-100', linkedAt: new Date() });
      await store.linkIssue({ runId: run.id, issueId: 'MOB-101', linkedAt: new Date() });

      const links = await store.listIssueLinks(run.id);

      const issueIds = links.map((l) => l.issueId);
      expect(issueIds).toContain('MOB-100');
      expect(issueIds).toContain('MOB-101');
    });

    it('listIssueLinks — returns empty array for a run with no links', async () => {
      const run = await store.createRun(makeRunData());
      const links = await store.listIssueLinks(run.id);
      expect(links).toHaveLength(0);
    });
  });
});
