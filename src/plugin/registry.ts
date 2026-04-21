import { loadLocalPlugins } from './loader-local.js';

export interface RegisteredPlugin {
  id: string;
  source: 'local' | 'npm';
  path: string;
  version: string;
  module: unknown; // internal — typed as unknown intentionally
}

export type PluginType = 'Command' | 'Phase' | 'FindingCategory' | 'PolicyAction' | 'AuditModule';

export class PluginRegistry {
  private plugins: RegisteredPlugin[] = [];
  private bootstrapped = false;

  async bootstrap(opts: { cwd: string }): Promise<RegisteredPlugin[]> {
    if (this.bootstrapped) {
      return this.list();
    }
    this.plugins = await loadLocalPlugins({ cwd: opts.cwd });
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
