import { z } from 'zod';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';

const PhaseToolsPolicySchema = z.object({
  allow: z.union([z.literal('*'), z.array(z.string())]).optional(),
  deny: z.array(z.string()).optional(),
});

const ToolsPolicyFileSchema = z.object({
  version: z.string(),
  phases: z.record(PhaseToolsPolicySchema),
});

export type ToolsPolicy = z.infer<typeof ToolsPolicyFileSchema>;

// No in-memory cache: hooks are short-lived processes (one invocation = one process),
// so reading fresh from disk on each call IS the hot-reload behavior.
export async function loadToolsPolicy(path: string): Promise<ToolsPolicy> {
  const content = await readFile(path, 'utf-8');
  const raw = yaml.load(content);
  return ToolsPolicyFileSchema.parse(raw);
}

export function isToolAllowed(toolName: string, phase: string, policy: ToolsPolicy): boolean {
  const phasePolicy = policy.phases[phase];
  if (!phasePolicy) {
    return true;
  }

  const { allow, deny } = phasePolicy;

  if (deny && deny.includes(toolName)) {
    return false;
  }

  if (allow === undefined || allow === '*') {
    return true;
  }

  return allow.includes(toolName);
}
