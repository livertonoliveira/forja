import { access } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { RegisteredPlugin } from './registry.js';
import { resolvePluginId } from './plugin-entry-parser.js';

interface LoadOptions {
  cwd: string;
  onWarn?: (pluginPath: string, reason: string) => void;
}

export async function loadLocalPlugins(opts: LoadOptions): Promise<RegisteredPlugin[]> {
  const rawPluginDir = process.env['FORJA_PLUGIN_DIR'] ?? join(opts.cwd, 'forja', 'plugins');
  const pluginDir = resolve(rawPluginDir);
  const cwdResolved = resolve(opts.cwd);

  if (!pluginDir.startsWith(cwdResolved + sep)) {
    throw new Error(
      `Plugin directory must be inside the project root.\n` +
        `  cwd:    ${cwdResolved}\n` +
        `  plugin: ${pluginDir}\n` +
        `Set FORJA_PLUGIN_DIR to a subdirectory of the project root.`,
    );
  }

  try {
    await access(pluginDir);
  } catch {
    return [];
  }

  const entries = await readdir(pluginDir, { withFileTypes: true });
  const pluginFiles = entries
    .filter(e => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.js')))
    .map(e => e.name);

  const warn = opts.onWarn ?? defaultWarn;
  const results = await Promise.allSettled(
    pluginFiles.map(file => importPlugin(resolve(pluginDir, file))),
  );

  const plugins: RegisteredPlugin[] = [];

  for (let i = 0; i < pluginFiles.length; i++) {
    const file = pluginFiles[i]!;
    const result = results[i]!;
    const filePath = resolve(pluginDir, file);
    const relPath = relative(cwdResolved, filePath);

    if (result.status === 'rejected') {
      warn(relPath, `Failed to import: ${String(result.reason)}`);
      continue;
    }

    const { id, hasValidExports } = resolvePluginId(result.value, file.replace(/\.(ts|js)$/, ''));

    if (!hasValidExports) {
      warn(relPath, 'No valid plugin exports found (expected at least one object with a string `id`)');
    }

    plugins.push({
      id,
      source: 'local',
      path: filePath,
      version: '0.0.0',
      module: result.value,
    });
  }

  plugins.sort((a, b) => a.id.localeCompare(b.id));

  return plugins;
}

async function importPlugin(filePath: string): Promise<Record<string, unknown>> {
  return (await import(filePath)) as Record<string, unknown>;
}

function defaultWarn(relPath: string, reason: string): void {
  console.warn(`[forja:plugin:low] ${relPath}: ${reason}`);
}
