import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from './versioning.js';

export const GateDecisionSchema = z.object({
  schemaVersion: z.string().default(CURRENT_SCHEMA_VERSION),
  id: z.string().uuid(),
  runId: z.string().uuid(),
  phaseId: z.string().uuid().optional(),
  decision: z.enum(['pass', 'warn', 'fail']),
  criticalCount: z.number().int().min(0),
  highCount: z.number().int().min(0),
  mediumCount: z.number().int().min(0),
  lowCount: z.number().int().min(0),
  policyApplied: z.string(),
  justification: z.string().nullable(),
  decidedAt: z.string().datetime(),
});

export type GateDecision = z.infer<typeof GateDecisionSchema>;
