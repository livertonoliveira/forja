import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from './versioning.js';

export const FindingSchema = z.object({
  schemaVersion: z.string().default(CURRENT_SCHEMA_VERSION),
  id: z.string().uuid(),
  runId: z.string().uuid(),
  phaseId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.string(),
  filePath: z.string().optional(),
  line: z.number().int().optional(),
  title: z.string(),
  description: z.string(),
  suggestion: z.string().optional(),
  owasp: z.string().optional(),
  cwe: z.string().optional(),
  fingerprint: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type Finding = z.infer<typeof FindingSchema>;
