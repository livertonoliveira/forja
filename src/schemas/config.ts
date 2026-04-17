import { z } from 'zod';

export const ConfigSchema = z.object({
  storeUrl: z.string(),
  retentionDays: z.number().int(),
  phasesDir: z.string(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  teamId: z.string(),
  linearToken: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
