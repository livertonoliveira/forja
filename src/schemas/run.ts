import { z } from 'zod';

export const RunStateEnum = z.enum([
  'init',
  'spec',
  'dev',
  'test',
  'perf',
  'security',
  'review',
  'homolog',
  'pr',
  'done',
  'failed',
]);

export type RunState = z.infer<typeof RunStateEnum>;
