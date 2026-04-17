import { z } from 'zod';

export const GateDecisionSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  phaseId: z.string().uuid().optional(),
  decision: z.enum(['pass', 'warn', 'fail']),
  criticalCount: z.number().int().min(0),
  highCount: z.number().int().min(0),
  mediumCount: z.number().int().min(0),
  lowCount: z.number().int().min(0),
  policyApplied: z.string(),
  decidedAt: z.string().datetime(),
});

export type GateDecision = z.infer<typeof GateDecisionSchema>;
