import { z } from 'zod';

export const TraceEventSchema = z.object({
  ts: z.string().datetime(),
  runId: z.string().uuid(),
  phaseId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  spanId: z.string().optional(),
  eventType: z.enum([
    'run_start',
    'run_end',
    'phase_start',
    'phase_end',
    'agent_start',
    'agent_end',
    'tool_call',
    'finding',
    'gate',
    'cost',
    'checkpoint',
    'error',
    'deprecation_warning',
    'plugin_registered',
  ]),
  commandFingerprint: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type TraceEvent = z.infer<typeof TraceEventSchema>;
