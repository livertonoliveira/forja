import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { FindingWriter } from '../../src/trace/finding-writer.js';
import { FindingSchema } from '../../src/schemas/index.js';
import { makeRunId } from './_helpers.js';

const phases = ['perf', 'security', 'review'] as const;

describe.each(phases)('FindingWriter contract — phase: %s', phase => {
  it('all findings returned by readAll parse against FindingSchema', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();
    const writer = new FindingWriter(runId, phaseId);

    writer.write({
      severity: 'medium',
      category: 'performance',
      title: `Slow loop in ${phase}`,
      description: 'Iterating over large collection without index',
      filePath: 'src/engine/runner.ts',
      line: 42,
      suggestion: 'Use a Map for O(1) lookups',
    });

    writer.write({
      severity: 'high',
      category: phase === 'security' ? 'injection' : phase,
      title: `Critical finding in ${phase}`,
      description: 'High severity finding for contract test',
      filePath: 'src/api/handler.ts',
      ...(phase === 'security' && {
        owasp: 'A03:2021 - Injection',
        cwe: 'CWE-89',
        suggestion: 'Parameterize all SQL queries',
      }),
    });

    await writer.flush();

    const findings = await FindingWriter.readAll(runId);

    expect(findings.length).toBeGreaterThanOrEqual(2);
    for (const f of findings) {
      expect(() => FindingSchema.parse(f)).not.toThrow();
    }
  });
});
