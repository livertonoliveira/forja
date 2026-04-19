import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and, desc, sql, lt, ne, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema.js';
import {
  runs,
  phases,
  agents,
  findings,
  toolCalls,
  costEvents,
  gateDecisions,
  issueLinks,
} from './schema.js';

import type { ForjaStore } from '../interface.js';
import type {
  Run, NewRun,
  Phase, NewPhase,
  Agent, NewAgent,
  Finding, NewFinding,
  ToolCall, NewToolCall,
  CostEvent, NewCostEvent,
  CostSummary,
  GateDecision, NewGateDecision,
  IssueLink, NewIssueLink,
} from '../types.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Helpers: convert Drizzle row shapes (Date timestamps) to plain domain types
// ---------------------------------------------------------------------------

type DrizzleRun = typeof runs.$inferSelect;
type DrizzlePhase = typeof phases.$inferSelect;
type DrizzleAgent = typeof agents.$inferSelect;
type DrizzleFinding = typeof findings.$inferSelect;
type DrizzleToolCall = typeof toolCalls.$inferSelect;
type DrizzleCostEvent = typeof costEvents.$inferSelect;
type DrizzleGateDecision = typeof gateDecisions.$inferSelect;
type DrizzleIssueLink = typeof issueLinks.$inferSelect;

function toRun(r: DrizzleRun): Run {
  return {
    ...r,
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
    finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : r.finishedAt,
  };
}

function toPhase(r: DrizzlePhase): Phase {
  return {
    ...r,
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
    finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : r.finishedAt,
  };
}

function toAgent(r: DrizzleAgent): Agent {
  return {
    ...r,
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
    finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : r.finishedAt,
  };
}

function toFinding(r: DrizzleFinding): Finding {
  return {
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

function toToolCall(r: DrizzleToolCall): ToolCall {
  return {
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

function toCostEvent(r: DrizzleCostEvent): CostEvent {
  return {
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

function toGateDecision(r: DrizzleGateDecision): GateDecision {
  return {
    ...r,
    decidedAt: r.decidedAt instanceof Date ? r.decidedAt.toISOString() : r.decidedAt,
  };
}

function toIssueLink(r: DrizzleIssueLink): IssueLink {
  return {
    ...r,
    linkedAt: r.linkedAt instanceof Date ? r.linkedAt.toISOString() : r.linkedAt,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class DrizzlePostgresStore implements ForjaStore {
  private pool: Pool;
  private db: NodePgDatabase<typeof schema>;

  constructor(connectionString: string, poolOptions?: { max?: number; idleTimeoutMillis?: number }) {
    this.pool = new Pool({ connectionString, max: 10, ...poolOptions });
    this.db = drizzle(this.pool, { schema });
  }

  async createRun(data: NewRun): Promise<Run> {
    const [row] = await this.db.insert(runs).values(data as unknown as DrizzleRun).returning();
    return toRun(row);
  }

  async updateRun(id: string, data: Partial<Omit<NewRun, 'id'>>): Promise<Run> {
    const [row] = await this.db.update(runs).set(data as unknown as Partial<DrizzleRun>).where(eq(runs.id, id)).returning();
    if (!row) throw new Error(`Not found: Run ${id}`);
    return toRun(row);
  }

  async getRun(id: string): Promise<Run | null> {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, id));
    return row ? toRun(row) : null;
  }

  async listRuns(filter?: { issueId?: string; status?: string }): Promise<Run[]> {
    const conditions = [];
    if (filter?.issueId) conditions.push(eq(runs.issueId, filter.issueId));
    if (filter?.status) conditions.push(eq(runs.status, filter.status as DrizzleRun['status']));
    const rows = conditions.length === 0
      ? await this.db.select().from(runs)
      : await this.db.select().from(runs).where(and(...conditions));
    return rows.map(toRun);
  }

  async createPhase(data: NewPhase): Promise<Phase> {
    const [row] = await this.db.insert(phases).values(data as unknown as DrizzlePhase).returning();
    return toPhase(row);
  }

  async updatePhase(id: string, data: Partial<Omit<NewPhase, 'id'>>): Promise<Phase> {
    const [row] = await this.db.update(phases).set(data as unknown as Partial<DrizzlePhase>).where(eq(phases.id, id)).returning();
    if (!row) throw new Error(`Not found: Phase ${id}`);
    return toPhase(row);
  }

  async getPhase(id: string): Promise<Phase | null> {
    const [row] = await this.db.select().from(phases).where(eq(phases.id, id));
    return row ? toPhase(row) : null;
  }

  async listPhases(runId: string): Promise<Phase[]> {
    const rows = await this.db.select().from(phases).where(eq(phases.runId, runId));
    return rows.map(toPhase);
  }

  async createAgent(data: NewAgent): Promise<Agent> {
    const [row] = await this.db.insert(agents).values(data as unknown as DrizzleAgent).returning();
    return toAgent(row);
  }

  async updateAgent(id: string, data: Partial<Omit<NewAgent, 'id'>>): Promise<Agent> {
    const [row] = await this.db.update(agents).set(data as unknown as Partial<DrizzleAgent>).where(eq(agents.id, id)).returning();
    if (!row) throw new Error(`Not found: Agent ${id}`);
    return toAgent(row);
  }

  async insertFinding(data: NewFinding): Promise<Finding> {
    const [row] = await this.db.insert(findings).values(data as unknown as DrizzleFinding).returning();
    return toFinding(row);
  }

  async insertFindings(data: NewFinding[]): Promise<Finding[]> {
    const rows = await this.db.insert(findings).values(data as unknown as DrizzleFinding[]).returning();
    return rows.map(toFinding);
  }

  async listFindings(filter: { runId?: string; phaseId?: string; severity?: string }): Promise<Finding[]> {
    const conditions = [];
    if (filter.runId) conditions.push(eq(findings.runId, filter.runId));
    if (filter.phaseId) conditions.push(eq(findings.phaseId, filter.phaseId));
    if (filter.severity) conditions.push(eq(findings.severity, filter.severity as DrizzleFinding['severity']));
    const rows = conditions.length === 0
      ? await this.db.select().from(findings)
      : await this.db.select().from(findings).where(and(...conditions));
    return rows.map(toFinding);
  }

  async insertToolCall(data: NewToolCall): Promise<ToolCall> {
    const [row] = await this.db.insert(toolCalls).values(data as unknown as DrizzleToolCall).returning();
    return toToolCall(row);
  }

  async insertCostEvent(data: NewCostEvent): Promise<CostEvent> {
    const [row] = await this.db.insert(costEvents).values(data as unknown as DrizzleCostEvent).returning();
    return toCostEvent(row);
  }

  async costSummaryByPhase(runId: string): Promise<CostSummary[]> {
    const rows = await this.db
      .select({
        phaseId: costEvents.phaseId,
        totalCost: sql<string>`sum(${costEvents.costUsd})`,
        totalTokensIn: sql<string>`sum(${costEvents.tokensIn})`,
        totalTokensOut: sql<string>`sum(${costEvents.tokensOut})`,
      })
      .from(costEvents)
      .where(eq(costEvents.runId, runId))
      .groupBy(costEvents.phaseId);

    return rows.map((r) => ({
      phaseId: r.phaseId,
      totalCost: r.totalCost,
      totalTokensIn: Number(r.totalTokensIn),
      totalTokensOut: Number(r.totalTokensOut),
    }));
  }

  async insertGateDecision(data: NewGateDecision): Promise<GateDecision> {
    const [row] = await this.db.insert(gateDecisions).values(data as unknown as DrizzleGateDecision).returning();
    return toGateDecision(row);
  }

  async getLatestGateDecision(runId: string, phaseId?: string): Promise<GateDecision | null> {
    const conditions = [eq(gateDecisions.runId, runId)];
    if (phaseId) conditions.push(eq(gateDecisions.phaseId, phaseId));
    const [row] = await this.db
      .select()
      .from(gateDecisions)
      .where(and(...conditions))
      .orderBy(desc(gateDecisions.decidedAt))
      .limit(1);
    return row ? toGateDecision(row) : null;
  }

  async linkIssue(data: NewIssueLink): Promise<IssueLink> {
    const [row] = await this.db.insert(issueLinks).values(data as unknown as DrizzleIssueLink).returning();
    return toIssueLink(row);
  }

  async listIssueLinks(runId: string): Promise<IssueLink[]> {
    const rows = await this.db.select().from(issueLinks).where(eq(issueLinks.runId, runId));
    return rows.map(toIssueLink);
  }

  async deleteRunsBefore(beforeDate: Date, options?: { dryRun?: boolean }): Promise<{ runIds: string[] }> {
    const candidateRuns = await this.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(lt(runs.startedAt, beforeDate), ne(runs.status, 'running' as any)));

    const runIds = candidateRuns.map((r) => r.id);

    if (runIds.length === 0 || options?.dryRun) return { runIds };

    await this.db.transaction(async (tx) => {
      for (const batch of chunk(runIds, 1000)) {
        await tx.delete(toolCalls).where(inArray(toolCalls.runId, batch));
        await tx.delete(costEvents).where(inArray(costEvents.runId, batch));
        await tx.delete(findings).where(inArray(findings.runId, batch));
        await tx.delete(gateDecisions).where(inArray(gateDecisions.runId, batch));
        await tx.delete(issueLinks).where(inArray(issueLinks.runId, batch));
        await tx.delete(agents).where(inArray(agents.runId, batch));
        await tx.delete(phases).where(inArray(phases.runId, batch));
        await tx.delete(runs).where(inArray(runs.id, batch));
      }
    });

    return { runIds };
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
