import { z } from 'zod';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';

const ValidModelSchema = z.enum([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',             // short alias accepted by the API
  'claude-haiku-4-5-20251001',    // canonical dated ID
]);

const ModelsPolicyFileSchema = z.object({
  version: z.string(),
  phases: z.record(z.string(), ValidModelSchema),
});

export type ModelsPolicy = z.infer<typeof ModelsPolicyFileSchema>;

export async function loadModelsPolicy(path: string): Promise<ModelsPolicy> {
  const content = await readFile(path, 'utf-8');
  const raw = yaml.load(content);
  return ModelsPolicyFileSchema.parse(raw);
}

export function getModelForPhase(phase: string, policy: ModelsPolicy): string | undefined {
  return policy.phases[phase];
}
