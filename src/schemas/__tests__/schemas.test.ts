import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  FindingSchema,
  GateDecisionSchema,
  RunStateEnum,
  ConfigSchema,
  TraceEventSchema,
  CostEventSchema,
} from '../index.js';

const UUID = '00000000-0000-0000-0000-000000000000';
const ISO_DT = '2024-01-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// FindingSchema
// ---------------------------------------------------------------------------
describe('FindingSchema', () => {
  it('parses valid data', () => {
    const valid = {
      id: UUID,
      runId: UUID,
      phaseId: UUID,
      severity: 'high',
      category: 'security',
      title: 'SQL Injection',
      description: 'User input is not sanitized.',
      createdAt: ISO_DT,
    };
    expect(() => FindingSchema.parse(valid)).not.toThrow();
  });

  it('accepts all optional fields', () => {
    const valid = {
      id: UUID,
      runId: UUID,
      phaseId: UUID,
      agentId: UUID,
      severity: 'critical',
      category: 'security',
      filePath: 'src/index.ts',
      line: 42,
      title: 'RCE',
      description: 'Remote code execution found.',
      suggestion: 'Sanitize input.',
      owasp: 'A1:2021',
      cwe: 'CWE-78',
      createdAt: ISO_DT,
    };
    expect(() => FindingSchema.parse(valid)).not.toThrow();
  });

  it('throws ZodError when id is not a UUID', () => {
    expect(() =>
      FindingSchema.parse({ id: 'not-a-uuid' })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when severity is invalid', () => {
    expect(() =>
      FindingSchema.parse({
        id: UUID,
        runId: UUID,
        phaseId: UUID,
        severity: 'extreme',
        category: 'security',
        title: 'X',
        description: 'Y',
        createdAt: ISO_DT,
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => FindingSchema.parse({})).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// GateDecisionSchema
// ---------------------------------------------------------------------------
describe('GateDecisionSchema', () => {
  it('parses valid data', () => {
    const valid = {
      id: UUID,
      runId: UUID,
      decision: 'pass',
      criticalCount: 0,
      highCount: 0,
      mediumCount: 1,
      lowCount: 3,
      policyApplied: 'default',
      decidedAt: ISO_DT,
    };
    expect(() => GateDecisionSchema.parse(valid)).not.toThrow();
  });

  it('accepts optional phaseId', () => {
    const valid = {
      id: UUID,
      runId: UUID,
      phaseId: UUID,
      decision: 'warn',
      criticalCount: 0,
      highCount: 0,
      mediumCount: 2,
      lowCount: 0,
      policyApplied: 'strict',
      decidedAt: ISO_DT,
    };
    expect(() => GateDecisionSchema.parse(valid)).not.toThrow();
  });

  it('throws ZodError when decision is invalid', () => {
    expect(() =>
      GateDecisionSchema.parse({
        id: UUID,
        runId: UUID,
        decision: 'maybe',
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        policyApplied: 'default',
        decidedAt: ISO_DT,
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when counts are not integers', () => {
    expect(() =>
      GateDecisionSchema.parse({
        id: UUID,
        runId: UUID,
        decision: 'fail',
        criticalCount: 1.5,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        policyApplied: 'default',
        decidedAt: ISO_DT,
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when counts are negative', () => {
    expect(() =>
      GateDecisionSchema.parse({
        id: UUID,
        runId: UUID,
        decision: 'fail',
        criticalCount: -1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        policyApplied: 'default',
        decidedAt: ISO_DT,
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => GateDecisionSchema.parse({})).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// RunStateEnum
// ---------------------------------------------------------------------------
describe('RunStateEnum', () => {
  it('parses valid state "init"', () => {
    expect(() => RunStateEnum.parse('init')).not.toThrow();
  });

  it('parses valid state "done"', () => {
    expect(() => RunStateEnum.parse('done')).not.toThrow();
  });

  it('parses every valid enum value', () => {
    for (const state of RunStateEnum.options) {
      expect(() => RunStateEnum.parse(state)).not.toThrow();
    }
  });

  it('throws ZodError when value is not a valid enum member', () => {
    expect(() => RunStateEnum.parse('unknown-phase')).toThrow(z.ZodError);
  });

  it('throws ZodError when value is undefined', () => {
    expect(() => RunStateEnum.parse(undefined)).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema
// ---------------------------------------------------------------------------
describe('ConfigSchema', () => {
  it('parses valid data', () => {
    const valid = {
      storeUrl: 'https://example.com/store',
      retentionDays: 30,
      phasesDir: './phases',
      logLevel: 'info',
      teamId: 'team-abc',
    };
    expect(() => ConfigSchema.parse(valid)).not.toThrow();
  });

  it('accepts optional linearToken', () => {
    const valid = {
      storeUrl: 'https://example.com/store',
      retentionDays: 7,
      phasesDir: '/var/phases',
      logLevel: 'debug',
      teamId: 'team-xyz',
      linearToken: 'lin_api_secret',
    };
    expect(() => ConfigSchema.parse(valid)).not.toThrow();
  });

  it('throws ZodError when logLevel is invalid', () => {
    expect(() =>
      ConfigSchema.parse({
        storeUrl: 'https://example.com',
        retentionDays: 10,
        phasesDir: '.',
        logLevel: 'verbose',
        teamId: 'team-1',
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when retentionDays is not an integer', () => {
    expect(() =>
      ConfigSchema.parse({
        storeUrl: 'https://example.com',
        retentionDays: 3.14,
        phasesDir: '.',
        logLevel: 'warn',
        teamId: 'team-1',
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => ConfigSchema.parse({})).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// TraceEventSchema
// ---------------------------------------------------------------------------
describe('TraceEventSchema', () => {
  it('parses valid data', () => {
    const valid = {
      ts: ISO_DT,
      runId: UUID,
      eventType: 'run_start',
      payload: { source: 'cli' },
    };
    expect(() => TraceEventSchema.parse(valid)).not.toThrow();
  });

  it('accepts all optional fields', () => {
    const valid = {
      ts: ISO_DT,
      runId: UUID,
      phaseId: UUID,
      agentId: UUID,
      spanId: 'span-001',
      eventType: 'agent_end',
      payload: { durationMs: 1500 },
    };
    expect(() => TraceEventSchema.parse(valid)).not.toThrow();
  });

  it('throws ZodError when eventType is invalid', () => {
    expect(() =>
      TraceEventSchema.parse({
        ts: ISO_DT,
        runId: UUID,
        eventType: 'unknown_event',
        payload: {},
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when ts is not a datetime string', () => {
    expect(() =>
      TraceEventSchema.parse({
        ts: 'not-a-date',
        runId: UUID,
        eventType: 'run_start',
        payload: {},
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => TraceEventSchema.parse({})).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// CostEventSchema
// ---------------------------------------------------------------------------
describe('CostEventSchema', () => {
  it('parses valid data', () => {
    const valid = {
      id: UUID,
      runId: UUID,
      phaseId: UUID,
      agentId: UUID,
      model: 'claude-sonnet-4-6',
      tokensIn: 1000,
      tokensOut: 500,
      costUsd: 0.015,
      createdAt: ISO_DT,
    };
    expect(() => CostEventSchema.parse(valid)).not.toThrow();
  });

  it('throws ZodError when tokensIn is not an integer', () => {
    expect(() =>
      CostEventSchema.parse({
        id: UUID,
        runId: UUID,
        phaseId: UUID,
        agentId: UUID,
        model: 'claude-sonnet-4-6',
        tokensIn: 100.5,
        tokensOut: 50,
        costUsd: 0.001,
        createdAt: ISO_DT,
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when agentId is not a UUID', () => {
    expect(() =>
      CostEventSchema.parse({
        id: UUID,
        runId: UUID,
        phaseId: UUID,
        agentId: 'not-a-uuid',
        model: 'claude-sonnet-4-6',
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.001,
        createdAt: ISO_DT,
      })
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => CostEventSchema.parse({})).toThrow(z.ZodError);
  });
});
