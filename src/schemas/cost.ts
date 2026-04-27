import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from './versioning.js';

export const CostEventSchema = z.object({
  schemaVersion: z.string().default(CURRENT_SCHEMA_VERSION),
  id: z.string().uuid(),
  runId: z.string().uuid(),
  phaseId: z.string().uuid(),
  agentId: z.string().uuid(),
  spanId: z.string().optional(),
  model: z.string(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  cacheCreationTokens: z.number().int().default(0),
  cacheReadTokens: z.number().int().default(0),
  costUsd: z.number(),
  createdAt: z.string().datetime(),
});

export type CostEvent = z.infer<typeof CostEventSchema>;
