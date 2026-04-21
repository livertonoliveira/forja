import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadNpmPlugins } from '../loader-npm.js';
import { PluginRegistry, PluginCollisionError } from '../registry.js';

async function createFakeNpmPlugin(dir: string, name: string, id: string, version = '1.2.3') {
  const pkgDir = join(dir, 'node_modules', name);
  await mkdir(pkgDir, { recursive: true });
  await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name, version, type: 'module', exports: './index.js' }));
  await writeFile(
    join(pkgDir, 'index.js'),
    `export const plugin = { id: '${id}', description: 'Test', run: async () => ({ exitCode: 0 }) };`,
  );
}

describe('loadNpmPlugins', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'forja-npm-plugin-test-'));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('returns [] when package.json has no forja-plugin-* deps', async () => {
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { lodash: '4.17.21' } }),
    );
    expect(await loadNpmPlugins({ cwd })).toEqual([]);
  });

  it('returns [] when package.json does not exist', async () => {
    expect(await loadNpmPlugins({ cwd })).toEqual([]);
  });

  it('loads forja-plugin-* packages from node_modules', async () => {
    await createFakeNpmPlugin(cwd, 'forja-plugin-alpha', 'alpha');
    await createFakeNpmPlugin(cwd, 'forja-plugin-beta', 'beta');
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        type: 'module',
        dependencies: { 'forja-plugin-alpha': '1.2.3', 'forja-plugin-beta': '1.2.3' },
      }),
    );

    const result = await loadNpmPlugins({ cwd });

    expect(result).toHaveLength(2);
    expect(result.every(p => p.source === 'npm')).toBe(true);
    expect(result.map(p => p.id)).toContain('alpha');
    expect(result.map(p => p.id)).toContain('beta');
  });

  it('reads version from the plugin package.json', async () => {
    await createFakeNpmPlugin(cwd, 'forja-plugin-versioned', 'versioned', '3.4.5');
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { 'forja-plugin-versioned': '3.4.5' } }),
    );

    const result = await loadNpmPlugins({ cwd });

    expect(result).toHaveLength(1);
    expect(result[0]!.version).toBe('3.4.5');
  });

  it('sorts alphabetically by id within npm group', async () => {
    await createFakeNpmPlugin(cwd, 'forja-plugin-zebra', 'zebra');
    await createFakeNpmPlugin(cwd, 'forja-plugin-apple', 'apple');
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        type: 'module',
        dependencies: { 'forja-plugin-zebra': '1.0.0', 'forja-plugin-apple': '1.0.0' },
      }),
    );

    const result = await loadNpmPlugins({ cwd });

    expect(result.map(p => p.id)).toEqual(['apple', 'zebra']);
  });

  it('warns but skips package that fails to import', async () => {
    const pkgDir = join(cwd, 'node_modules', 'forja-plugin-broken');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name: 'forja-plugin-broken', version: '1.0.0', type: 'module', exports: './index.js' }));
    await writeFile(join(pkgDir, 'index.js'), `throw new Error('intentional import error');`);
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { 'forja-plugin-broken': '1.0.0' } }),
    );

    const warnings: Array<{ pkgName: string; reason: string }> = [];
    const result = await loadNpmPlugins({
      cwd,
      onWarn: (pkgName, reason) => warnings.push({ pkgName, reason }),
    });

    expect(result).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toContain('Failed to import');
  });

  it('warns but still registers when no valid exports found', async () => {
    const pkgDir = join(cwd, 'node_modules', 'forja-plugin-noexports');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name: 'forja-plugin-noexports', version: '1.0.0', type: 'module', exports: './index.js' }));
    await writeFile(join(pkgDir, 'index.js'), `export const notAPlugin = { noId: true };`);
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { 'forja-plugin-noexports': '1.0.0' } }),
    );

    const warnings: Array<{ pkgName: string; reason: string }> = [];
    const result = await loadNpmPlugins({
      cwd,
      onWarn: (pkgName, reason) => warnings.push({ pkgName, reason }),
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('npm');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toContain('No valid plugin exports');
  });
});

describe('PluginRegistry collision and ordering', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'forja-registry-test-'));
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('throws PluginCollisionError when local and npm plugins share the same id', async () => {
    // Local plugin with id 'my-plugin'
    const pluginsDir = join(cwd, 'forja', 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(
      join(pluginsDir, 'my-plugin.js'),
      `export const plugin = { id: 'my-plugin', description: 'Local', run: async () => ({ exitCode: 0 }) };`,
    );

    // npm plugin with same id 'my-plugin'
    await createFakeNpmPlugin(cwd, 'forja-plugin-npm', 'my-plugin');
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { 'forja-plugin-npm': '1.0.0' } }),
    );

    const registry = new PluginRegistry();
    await expect(registry.bootstrap({ cwd })).rejects.toThrow(PluginCollisionError);
  });

  it('orders plugins: local first, then npm (alphabetical within each group)', async () => {
    // Local plugin with id 'beta'
    const pluginsDir = join(cwd, 'forja', 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(
      join(pluginsDir, 'beta.js'),
      `export const plugin = { id: 'beta', description: 'Beta', run: async () => ({ exitCode: 0 }) };`,
    );

    // npm plugin with id 'alpha'
    await createFakeNpmPlugin(cwd, 'forja-plugin-alpha', 'alpha');
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ type: 'module', dependencies: { 'forja-plugin-alpha': '1.0.0' } }),
    );

    const registry = new PluginRegistry();
    const plugins = await registry.bootstrap({ cwd });

    expect(plugins.map(p => p.id)).toEqual(['beta', 'alpha']);
  });
});
