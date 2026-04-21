import { z } from 'zod';

export const StackInfoSchema = z.object({
  language: z.string(),
  runtime: z.string(),
  framework: z.string().optional(),
});

export const AuditFindingSchema = z.object({
  schemaVersion: z.literal('1.0'),
  id: z.string().min(1).max(128).regex(/^[\w:\-]+$/),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1).max(512),
  category: z.string().min(1).max(64),
  description: z.string().min(1).max(4096),
  filePath: z.string().optional(),
  line: z.number().optional(),
  endLine: z.number().optional(),
  snippet: z.string().max(2048).optional(),
  cwe: z.string().max(32).optional(),
  remediation: z.string().max(4096).optional(),
  exploitVector: z.string().max(2048).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
});

export const AuditReportSchema = z.object({
  schemaVersion: z.literal('1.0'),
  auditId: z.string().min(1).max(128),
  stackInfo: StackInfoSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  findings: z.array(AuditFindingSchema),
  markdown: z.string().max(65536),
  summary: z.object({
    total: z.number(),
    bySeverity: z.record(z.number()),
  }),
});

// These types represent the validated, schema-versioned record shapes produced
// by the runner. They are intentionally distinct from the AuditModule plugin
// interface types (src/plugin/types.ts) which lack schemaVersion and id.
export type StackInfoRecord = z.infer<typeof StackInfoSchema>;
export type AuditFindingRecord = z.infer<typeof AuditFindingSchema>;
export type AuditReportRecord = z.infer<typeof AuditReportSchema>;
