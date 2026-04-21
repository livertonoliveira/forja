import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { RegisteredPlugin } from './registry.js';
import { resolvePluginId } from './plugin-entry-parser.js';

interface LoadOptions {
  cwd: string;
  onWarn?: (pkgName: string, reason: string) => void;
}

export async function loadNpmPlugins(opts: LoadOptions): Promise<RegisteredPlugin[]> {
  const warn = opts.onWarn ?? defaultWarn;

  let pkgJson: Record<string, unknown>;
  try {
    const raw = await readFile(join(opts.cwd, 'package.json'), 'utf8');
    pkgJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return [];
  }

  const deps = {
    ...((pkgJson['dependencies'] as Record<string, string> | undefined) ?? {}),
    ...((pkgJson['devDependencies'] as Record<string, string> | undefined) ?? {}),
  };

  const forjaPluginNames = Object.keys(deps).filter(name => name.startsWith('forja-plugin-'));

  if (forjaPluginNames.length === 0) {
    return [];
  }

  const require = createRequire(join(opts.cwd, 'package.json'));

  const results = await Promise.allSettled(
    forjaPluginNames.map(async name => {
      const resolvedPath = require.resolve(name);
      const mod = (await import(resolvedPath)) as Record<string, unknown>;
      const version = await readPluginVersion(name, resolvedPath, require);
      return { name, resolvedPath, mod, version };
    }),
  );

  const plugins: RegisteredPlugin[] = [];

  for (let i = 0; i < forjaPluginNames.length; i++) {
    const pkgName = forjaPluginNames[i]!;
    const result = results[i]!;

    if (result.status === 'rejected') {
      warn(pkgName, `Failed to import: ${String(result.reason)}`);
      continue;
    }

    const { resolvedPath, mod, version } = result.value;
    const { id, hasValidExports } = resolvePluginId(mod, pkgName);

    if (!hasValidExports) {
      warn(pkgName, 'No valid plugin exports found (expected at least one object with a string `id`)');
    }

    plugins.push({
      id,
      source: 'npm',
      path: resolvedPath,
      version,
      module: mod,
    });
  }

  plugins.sort((a, b) => a.id.localeCompare(b.id));

  return plugins;
}

async function readPluginVersion(
  pkgName: string,
  resolvedPath: string,
  require: NodeRequire,
): Promise<string> {
  // Try subpath export first (works when package explicitly exports package.json)
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
    const raw = await readFile(pkgJsonPath, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data['version'] === 'string') return data['version'];
  } catch {
    // fallthrough to directory walk
  }

  // Walk up from the resolved entry file to find a package.json with a matching name
  let dir = dirname(resolvedPath);
  for (let depth = 0; depth < 5; depth++) {
    const candidate = join(dir, 'package.json');
    try {
      const raw = await readFile(candidate, 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data['name'] === pkgName && typeof data['version'] === 'string') {
        return data['version'];
      }
    } catch {
      // not found here, keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return '0.0.0';
}

function defaultWarn(pkgName: string, reason: string): void {
  console.warn(`[forja:plugin:low] ${pkgName}: ${reason}`);
}
