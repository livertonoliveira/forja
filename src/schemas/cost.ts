import { z } from 'zod';

export const CostEventSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  phaseId: z.string().uuid(),
  agentId: z.string().uuid(),
  model: z.string(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costUsd: z.number(),
  createdAt: z.string().datetime(),
});

export type CostEvent = z.infer<typeof CostEventSchema>;
