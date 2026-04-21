import { z } from 'zod';

export const PluginEntrySchema = z.object({ id: z.string().min(1) }).passthrough();

export const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function resolvePluginId(
  mod: Record<string, unknown>,
  fallbackId: string,
): { id: string; hasValidExports: boolean } {
  const safeValues = Object.entries(mod)
    .filter(([key]) => !BLOCKED_KEYS.has(key))
    .map(([, value]) => value);

  const validEntries = safeValues.filter(value => PluginEntrySchema.safeParse(value).success);
  const firstEntry = validEntries[0] as { id: string } | undefined;

  return {
    id: firstEntry?.id ?? fallbackId,
    hasValidExports: validEntries.length > 0,
  };
}
