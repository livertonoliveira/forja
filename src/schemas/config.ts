import { z } from 'zod';

export const PhaseTimeoutsSchema = z.object({
  dev: z.number().int().positive().default(600),
  test: z.number().int().positive().default(300),
  perf: z.number().int().positive().default(180),
  security: z.number().int().positive().default(180),
  review: z.number().int().positive().default(180),
  homolog: z.number().int().positive().default(60),
  pr: z.number().int().positive().default(120),
});

export const ConfigSchema = z.object({
  storeUrl: z.string(),
  retentionDays: z.number().int().default(90),
  phasesDir: z.string(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  teamId: z.string(),
  linearToken: z.string().optional(),
  timeouts: PhaseTimeoutsSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type PhaseTimeouts = z.infer<typeof PhaseTimeoutsSchema>;
