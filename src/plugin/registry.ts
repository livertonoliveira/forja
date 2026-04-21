import { relative } from 'node:path';
import { loadLocalPlugins } from './loader-local.js';
import { loadNpmPlugins } from './loader-npm.js';
import type { TraceWriter } from '../trace/writer.js';

export interface RegisteredPlugin {
  id: string;
  source: 'local' | 'npm';
  path: string;
  version: string;
  module: unknown; // internal — typed as unknown intentionally
}

export type PluginType = 'Command' | 'Phase' | 'FindingCategory' | 'PolicyAction' | 'AuditModule';

export class PluginCollisionError extends Error {
  constructor(public readonly collidingId: string, public readonly sources: Array<{ id: string; source: string; path: string }>) {
    super(
      `Plugin collision: id "${collidingId}" is registered by multiple sources: ` +
        sources.map(s => `${s.source}:${s.path}`).join(', ')
    );
    this.name = 'PluginCollisionError';
  }
}

export class PluginRegistry {
  private plugins: RegisteredPlugin[] = [];
  private bootstrapped = false;

  async bootstrap(opts: { cwd: string; traceWriter?: TraceWriter }): Promise<RegisteredPlugin[]> {
    if (this.bootstrapped) {
      return this.list();
    }

    const localPlugins = await loadLocalPlugins({ cwd: opts.cwd });
    const npmPlugins = await loadNpmPlugins({ cwd: opts.cwd });

    // Detect collisions: check if any id appears in both lists or within same list
    const allPlugins = [...localPlugins, ...npmPlugins];
    const idMap = new Map<string, RegisteredPlugin[]>();
    for (const plugin of allPlugins) {
      const existing = idMap.get(plugin.id) ?? [];
      existing.push(plugin);
      idMap.set(plugin.id, existing);
    }

    for (const [id, pluginsWithId] of idMap.entries()) {
      if (pluginsWithId.length > 1) {
        throw new PluginCollisionError(
          id,
          pluginsWithId.map(p => ({
            id: p.id,
            source: p.source,
            path: relative(opts.cwd, p.path),
          })),
        );
      }
    }

    // allPlugins is already local-first, npm-after (each group sorted alphabetically)
    if (opts.traceWriter) {
      for (const plugin of allPlugins) {
        await opts.traceWriter.writePluginRegistered({
          ...plugin,
          path: relative(opts.cwd, plugin.path),
        });
      }
    }

    this.plugins = allPlugins;
    this.bootstrapped = true;
    return this.plugins;
  }

  list(): RegisteredPlugin[] {
    return [...this.plugins];
  }

  getByType<T extends object>(type: PluginType): T[] {
    const results: T[] = [];
    for (const plugin of this.plugins) {
      const mod = plugin.module as Record<string, unknown>;
      for (const value of Object.values(mod)) {
        if (matchesPluginType(value, type)) {
          results.push(value as T);
        }
      }
    }
    return results;
  }
}

function matchesPluginType(value: unknown, type: PluginType): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj['id'] !== 'string') return false;

  switch (type) {
    case 'Command':
      return typeof obj['description'] === 'string' && typeof obj['run'] === 'function';
    case 'Phase':
      return (
        typeof obj['run'] === 'function' &&
        typeof obj['description'] === 'undefined' &&
        typeof obj['execute'] === 'undefined' &&
        typeof obj['detect'] === 'undefined'
      );
    case 'FindingCategory':
      return typeof obj['name'] === 'string' && typeof obj['defaultSeverity'] === 'string';
    case 'PolicyAction':
      return typeof obj['execute'] === 'function';
    case 'AuditModule':
      return (
        typeof obj['detect'] === 'function' &&
        typeof obj['run'] === 'function' &&
        typeof obj['report'] === 'function'
      );
    default:
      return false;
  }
}

const PLUGIN_TYPES: PluginType[] = ['Command', 'Phase', 'FindingCategory', 'PolicyAction', 'AuditModule'];

/**
 * Returns the list of PluginType names matched by any export in the given plugin module.
 * Returns `['unknown']` if no exports match any known type.
 */
export function detectPluginTypes(plugin: RegisteredPlugin): string[] {
  const mod = plugin.module as Record<string, unknown>;
  const matched = new Set<string>();

  for (const value of Object.values(mod)) {
    for (const type of PLUGIN_TYPES) {
      if (matchesPluginType(value, type)) {
        matched.add(type);
      }
    }
  }

  return matched.size > 0 ? [...matched] : ['unknown'];
}
