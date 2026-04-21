import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginRegistry } from '../../../plugin/registry.js';
import { pluginsCommand } from '../plugins.js';

// Helper: capture console.log output while running a callback
async function captureOutput(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

/**
 * Run `forja plugins list [args]` via the real Commander command and capture output.
 * Uses `pluginsCommand.parseAsync` — the same surface as the real CLI.
 */
async function runListCommand(args: string[] = []): Promise<string[]> {
  return captureOutput(async () => {
    await pluginsCommand.parseAsync(['list', ...args], { from: 'user' });
  });
}

describe('plugins list — integration', () => {
  let cwd: string;
  let pluginDir: string;
  let originalEnv: string | undefined;

  // Mocks for the registry, so we can control what plugins are loaded
  // without relying on filesystem ESM dynamic imports (which are tricky in workers).
  const mockBootstrap = vi.fn();
  const mockList = vi.fn();

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'forja-plugins-int-'));
    pluginDir = join(cwd, 'forja', 'plugins');
    await mkdir(pluginDir, { recursive: true });
    // ESM modules in the temp dir need a package.json with type: module
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));

    originalEnv = process.env['FORJA_PLUGIN_DIR'];
    process.env['FORJA_PLUGIN_DIR'] = pluginDir;

    // Spy on PluginRegistry constructor to inject our controlled instance
    vi.spyOn(PluginRegistry.prototype, 'bootstrap').mockImplementation(mockBootstrap);
    vi.spyOn(PluginRegistry.prototype, 'list').mockImplementation(mockList);

    // Reset Commander's internal option state on the list subcommand so option
    // values from a previous test (e.g. --invalid) don't bleed into the next.
    const listSubcommand = pluginsCommand.commands.find((c) => c.name() === 'list');
    if (listSubcommand) {
      (listSubcommand as unknown as { _optionValues: Record<string, unknown> })._optionValues = {};
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    if (originalEnv === undefined) {
      delete process.env['FORJA_PLUGIN_DIR'];
    } else {
      process.env['FORJA_PLUGIN_DIR'] = originalEnv;
    }

    await rm(cwd, { recursive: true, force: true });
  });

  it('prints "No plugins registered." when no plugins exist', async () => {
    mockBootstrap.mockResolvedValue([]);
    mockList.mockReturnValue([]);

    const lines = await runListCommand();
    expect(lines.some((l) => l.includes('No plugins registered.'))).toBe(true);
  });

  it('renders ASCII table header and separator when a plugin exists', async () => {
    const plugin = {
      id: 'my-cmd',
      source: 'local' as const,
      path: join(pluginDir, 'my-cmd.js'),
      version: '0.0.0',
      module: {
        myCmd: { id: 'my-cmd', description: 'Test cmd', run: async () => ({ exitCode: 0 }) },
      },
    };
    mockBootstrap.mockResolvedValue([plugin]);
    mockList.mockReturnValue([plugin]);

    const lines = await runListCommand();
    const output = lines.join('\n');

    // Header columns
    expect(output).toContain('ID');
    expect(output).toContain('Type');
    expect(output).toContain('Version');
    expect(output).toContain('Source');
    // Separator line
    expect(lines.some((l) => /^-+/.test(l))).toBe(true);
    // Plugin data row
    expect(output).toContain('my-cmd');
    expect(output).toContain('local');
    expect(output).toContain('0.0.0');
  });

  it('detects Command type for a plugin with id, description, and run', async () => {
    const plugin = {
      id: 'typed-cmd',
      source: 'local' as const,
      path: join(pluginDir, 'typed-cmd.js'),
      version: '0.0.0',
      module: {
        cmd: { id: 'typed-cmd', description: 'Typed', run: async () => ({ exitCode: 0 }) },
      },
    };
    mockBootstrap.mockResolvedValue([plugin]);
    mockList.mockReturnValue([plugin]);

    const lines = await runListCommand();
    const output = lines.join('\n');

    expect(output).toContain('Command');
  });

  it('outputs valid JSON array with --json flag', async () => {
    const plugin = {
      id: 'json-plugin',
      source: 'local' as const,
      path: join(pluginDir, 'json-plugin.js'),
      version: '0.0.0',
      module: {
        cmd: { id: 'json-plugin', description: 'JSON test', run: async () => ({ exitCode: 0 }) },
      },
    };
    mockBootstrap.mockResolvedValue([plugin]);
    mockList.mockReturnValue([plugin]);

    const lines = await runListCommand(['--json']);
    const raw = lines.join('');
    const parsed = JSON.parse(raw) as Array<{ id: string; source: string; version: string; module?: unknown }>;

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe('json-plugin');
    expect(parsed[0]!.source).toBe('local');
    expect(parsed[0]!.version).toBe('0.0.0');
    // module field must be stripped from JSON output
    expect(Object.keys(parsed[0]!)).not.toContain('module');
  });

  it('prints status message with --invalid flag (no bootstrap)', async () => {
    const lines = await runListCommand(['--invalid']);
    const output = lines.join('\n');
    expect(output).toContain('No invalid plugin tracking available');
  });

  it('renders multiple plugins sorted alphabetically', async () => {
    const alpha = {
      id: 'alpha',
      source: 'local' as const,
      path: join(pluginDir, 'alpha.js'),
      version: '0.0.0',
      module: { cmd: { id: 'alpha', description: 'A', run: async () => ({ exitCode: 0 }) } },
    };
    const zebra = {
      id: 'zebra',
      source: 'local' as const,
      path: join(pluginDir, 'zebra.js'),
      version: '0.0.0',
      module: { cmd: { id: 'zebra', description: 'Z', run: async () => ({ exitCode: 0 }) } },
    };
    // alpha-first (alphabetical)
    mockBootstrap.mockResolvedValue([alpha, zebra]);
    mockList.mockReturnValue([alpha, zebra]);

    const lines = await runListCommand();
    const output = lines.join('\n');

    const alphaPos = output.indexOf('alpha');
    const zebraPos = output.indexOf('zebra');
    expect(alphaPos).toBeGreaterThan(-1);
    expect(zebraPos).toBeGreaterThan(-1);
    // alpha should appear before zebra
    expect(alphaPos).toBeLessThan(zebraPos);
  });

  it('JSON output with multiple plugins contains all entries', async () => {
    const pluginA = {
      id: 'plugin-a',
      source: 'local' as const,
      path: join(pluginDir, 'plugin-a.js'),
      version: '0.0.0',
      module: { cmd: { id: 'plugin-a', description: 'A', run: async () => ({ exitCode: 0 }) } },
    };
    const pluginB = {
      id: 'plugin-b',
      source: 'local' as const,
      path: join(pluginDir, 'plugin-b.js'),
      version: '0.0.0',
      module: { cmd: { id: 'plugin-b', description: 'B', run: async () => ({ exitCode: 0 }) } },
    };
    mockBootstrap.mockResolvedValue([pluginA, pluginB]);
    mockList.mockReturnValue([pluginA, pluginB]);

    const lines = await runListCommand(['--json']);
    const parsed = JSON.parse(lines.join('')) as Array<{ id: string }>;

    expect(parsed).toHaveLength(2);
    expect(parsed.map((p) => p.id)).toEqual(['plugin-a', 'plugin-b']);
  });
});
