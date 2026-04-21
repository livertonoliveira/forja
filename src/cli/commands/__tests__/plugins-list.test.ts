/**
 * Unit tests for `src/cli/commands/plugins.ts` — MOB-1038.
 *
 * Covers:
 *   - No plugins → friendly "No plugins registered." message
 *   - Valid plugins → ASCII table with all columns (ID, Type, Version, Source, Path)
 *   - --json flag → valid JSON output without `module` field
 *   - --invalid flag → message about lack of invalid-plugin tracking (no crash)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock PluginRegistry before importing the command
// ---------------------------------------------------------------------------

const mockBootstrap = vi.fn();
const mockList = vi.fn();

vi.mock('../../../plugin/registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../plugin/registry.js')>();
  return {
    ...actual,
    PluginRegistry: vi.fn().mockImplementation(() => ({
      bootstrap: mockBootstrap,
      list: mockList,
    })),
  };
});

// Import after mocks are set up
import { pluginsCommand } from '../plugins.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockPlugin = {
  id: 'my-plugin',
  source: 'local' as const,
  path: '/home/user/forja/plugins/my-plugin.ts',
  version: '1.2.3',
  module: {
    myPlugin: {
      id: 'my-plugin',
      description: 'A test command plugin',
      run: () => {},
    },
  },
};

const mockNpmPlugin = {
  id: 'npm-plugin',
  source: 'npm' as const,
  path: '/home/user/node_modules/forja-plugin-npm/index.js',
  version: '0.5.0',
  module: {
    npmPlugin: {
      id: 'npm-plugin',
      description: 'An npm plugin',
      run: () => {},
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Invoke `forja plugins list [args]` programmatically and capture console.log calls.
 * Returns the array of strings passed to console.log.
 */
async function runListCommand(args: string[] = []): Promise<string[]> {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...msgs: unknown[]) => {
    logs.push(msgs.map(String).join(' '));
  });

  try {
    // pluginsCommand is `plugins`, its subcommand is `list`
    await pluginsCommand.parseAsync(['list', ...args], { from: 'user' });
  } finally {
    spy.mockRestore();
  }

  return logs;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('plugins list — no plugins', () => {
  beforeEach(() => {
    mockBootstrap.mockResolvedValue([]);
    mockList.mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prints a friendly "No plugins registered." message', async () => {
    const logs = await runListCommand();
    expect(logs.some((line) => line.includes('No plugins registered.'))).toBe(true);
  });

  it('calls bootstrap once', async () => {
    await runListCommand();
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
  });
});

describe('plugins list — with valid plugins', () => {
  beforeEach(() => {
    mockBootstrap.mockResolvedValue([mockPlugin, mockNpmPlugin]);
    mockList.mockReturnValue([mockPlugin, mockNpmPlugin]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prints a header row containing all column names', async () => {
    const logs = await runListCommand();
    const header = logs[0];
    expect(header).toContain('ID');
    expect(header).toContain('Type');
    expect(header).toContain('Version');
    expect(header).toContain('Source');
    expect(header).toContain('Path');
  });

  it('prints a separator line after the header', async () => {
    const logs = await runListCommand();
    // The separator is composed of dashes
    expect(logs[1]).toMatch(/^-+/);
  });

  it('prints a row for each plugin containing its id, version, source and path', async () => {
    const logs = await runListCommand();
    const allOutput = logs.join('\n');

    expect(allOutput).toContain(mockPlugin.id);
    expect(allOutput).toContain(mockPlugin.version);
    expect(allOutput).toContain(mockPlugin.source);
    expect(allOutput).toContain(mockPlugin.path);

    expect(allOutput).toContain(mockNpmPlugin.id);
    expect(allOutput).toContain(mockNpmPlugin.version);
    expect(allOutput).toContain(mockNpmPlugin.source);
    expect(allOutput).toContain(mockNpmPlugin.path);
  });

  it('detects "Command" type for plugins with description and run', async () => {
    const logs = await runListCommand();
    const allOutput = logs.join('\n');
    expect(allOutput).toContain('Command');
  });

  it('does not print "No plugins registered." when plugins exist', async () => {
    const logs = await runListCommand();
    expect(logs.some((line) => line.includes('No plugins registered.'))).toBe(false);
  });
});

describe('plugins list --json', () => {
  beforeEach(() => {
    mockBootstrap.mockResolvedValue([mockPlugin, mockNpmPlugin]);
    mockList.mockReturnValue([mockPlugin, mockNpmPlugin]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('outputs valid JSON', async () => {
    const logs = await runListCommand(['--json']);
    const combined = logs.join('');
    expect(() => JSON.parse(combined)).not.toThrow();
  });

  it('outputs an array of plugin objects', async () => {
    const logs = await runListCommand(['--json']);
    const parsed = JSON.parse(logs.join(''));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('each JSON entry contains id, source, path, version', async () => {
    const logs = await runListCommand(['--json']);
    const [first] = JSON.parse(logs.join(''));
    expect(first).toHaveProperty('id', mockPlugin.id);
    expect(first).toHaveProperty('source', mockPlugin.source);
    expect(first).toHaveProperty('path', mockPlugin.path);
    expect(first).toHaveProperty('version', mockPlugin.version);
  });

  it('JSON output does NOT contain the module field', async () => {
    const logs = await runListCommand(['--json']);
    const [first] = JSON.parse(logs.join(''));
    expect(first).not.toHaveProperty('module');
  });
});

describe('plugins list --json with no plugins', () => {
  beforeEach(() => {
    mockBootstrap.mockResolvedValue([]);
    mockList.mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('outputs an empty JSON array', async () => {
    const logs = await runListCommand(['--json']);
    const parsed = JSON.parse(logs.join(''));
    expect(parsed).toEqual([]);
  });
});

describe('plugins list --invalid', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prints a message about invalid plugin tracking', async () => {
    const logs = await runListCommand(['--invalid']);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].length).toBeGreaterThan(0);
  });

  it('does not call bootstrap when --invalid is used', async () => {
    await runListCommand(['--invalid']);
    expect(mockBootstrap).not.toHaveBeenCalled();
  });

  it('message mentions bootstrap or stderr for finding invalid plugins', async () => {
    const logs = await runListCommand(['--invalid']);
    const allOutput = logs.join('\n').toLowerCase();
    // Should mention either bootstrap or stderr to guide user
    expect(allOutput.includes('bootstrap') || allOutput.includes('stderr')).toBe(true);
  });
});
