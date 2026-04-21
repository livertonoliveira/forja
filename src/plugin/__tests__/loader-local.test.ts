import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadLocalPlugins } from '../loader-local.js';

describe('loadLocalPlugins', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'forja-plugin-test-'));
    // Make .js files in this temp dir behave as ESM
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('returns [] when forja/plugins does not exist', async () => {
    expect(await loadLocalPlugins({ cwd })).toEqual([]);
  });

  it('returns [] for empty directory', async () => {
    await mkdir(join(cwd, 'forja', 'plugins'), { recursive: true });
    expect(await loadLocalPlugins({ cwd })).toEqual([]);
  });

  it('loads 3 valid plugins sorted alphabetically by id', async () => {
    const dir = join(cwd, 'forja', 'plugins');
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, 'charlie.js'),
      `export const cmd = { id: 'charlie', description: 'Charlie', run: async () => ({ exitCode: 0 }) };`,
    );
    await writeFile(
      join(dir, 'alpha.js'),
      `export const cmd = { id: 'alpha', description: 'Alpha', run: async () => ({ exitCode: 0 }) };`,
    );
    await writeFile(
      join(dir, 'bravo.js'),
      `export const cmd = { id: 'bravo', description: 'Bravo', run: async () => ({ exitCode: 0 }) };`,
    );

    const result = await loadLocalPlugins({ cwd });

    expect(result).toHaveLength(3);
    expect(result.map(p => p.id)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(result.every(p => p.source === 'local')).toBe(true);
    expect(result.every(p => p.version === '0.0.0')).toBe(true);
  });

  it('warns but still registers a plugin with invalid shape', async () => {
    const dir = join(cwd, 'forja', 'plugins');
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, 'invalid.js'),
      `export const notAPlugin = { noId: true };`,
    );

    const warnings: Array<{ path: string; reason: string }> = [];
    const result = await loadLocalPlugins({
      cwd,
      onWarn: (path, reason) => warnings.push({ path, reason }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('local');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toContain('No valid plugin exports');
  });

  it('FORJA_PLUGIN_DIR overrides the default directory', async () => {
    const customDir = join(cwd, 'custom-plugins');
    await mkdir(customDir, { recursive: true });

    await writeFile(
      join(customDir, 'custom.js'),
      `export const cmd = { id: 'custom-cmd', description: 'Custom', run: async () => ({ exitCode: 0 }) };`,
    );

    const original = process.env['FORJA_PLUGIN_DIR'];
    process.env['FORJA_PLUGIN_DIR'] = customDir;
    try {
      const result = await loadLocalPlugins({ cwd });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('custom-cmd');
    } finally {
      if (original === undefined) {
        delete process.env['FORJA_PLUGIN_DIR'];
      } else {
        process.env['FORJA_PLUGIN_DIR'] = original;
      }
    }
  });

  it('warns and skips a plugin file that throws on import', async () => {
    const dir = join(cwd, 'forja', 'plugins');
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, 'broken.js'), `throw new Error('intentional import error');`);

    const warnings: Array<{ path: string; reason: string }> = [];
    const result = await loadLocalPlugins({
      cwd,
      onWarn: (path, reason) => warnings.push({ path, reason }),
    });

    expect(result).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toContain('Failed to import');
  });

  it('ignores subdirectories named like plugin files', async () => {
    const dir = join(cwd, 'forja', 'plugins');
    await mkdir(join(dir, 'subdir.js'), { recursive: true }); // directory, not a file

    const result = await loadLocalPlugins({ cwd });
    expect(result).toHaveLength(0);
  });

  it('throws when FORJA_PLUGIN_DIR points outside project root', async () => {
    process.env['FORJA_PLUGIN_DIR'] = '/tmp/evil-plugins';
    try {
      await expect(loadLocalPlugins({ cwd })).rejects.toThrow(
        'Plugin directory must be inside the project root',
      );
    } finally {
      delete process.env['FORJA_PLUGIN_DIR'];
    }
  });
});
