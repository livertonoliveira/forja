import { z } from 'zod';
import yaml from 'js-yaml';
import { readFile } from 'fs/promises';
import fs, { type FSWatcher } from 'fs';

export const PolicyActionSchema = z.object({
  action: z.enum(['fail_gate', 'warn_gate', 'pass_gate', 'log', 'http_post', 'notify_slack']),
  message: z.string().optional(),
  url: z.string().optional(),
  channel: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
});

export const PolicyRuleSchema = z.object({
  name: z.string(),
  when: z.record(z.string()),
  then: z.array(PolicyActionSchema),
});

export const PolicyFileSchema = z.object({
  version: z.string(),
  policies: z.array(PolicyRuleSchema),
});

export type PolicyAction = z.infer<typeof PolicyActionSchema>;
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyFile = z.infer<typeof PolicyFileSchema>;

export async function loadPolicy(path: string): Promise<PolicyFile> {
  const content = await readFile(path, 'utf-8');
  const raw = yaml.load(content);
  return PolicyFileSchema.parse(raw);  // throws ZodError if invalid
}

export function watchPolicy(path: string, onChange: (policy: PolicyFile) => void): FSWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  return fs.watch(path, { persistent: false }, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const policy = await loadPolicy(path);
        onChange(policy);
      } catch {
        // ignore parse errors during watch — keep last good policy
      }
    }, 150);
  });
}
