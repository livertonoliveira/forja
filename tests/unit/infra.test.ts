import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Module mocks (must be hoisted before imports) ---
vi.mock('../../src/infra/docker.js', () => ({
  checkDockerAvailable: vi.fn(),
  composeUp: vi.fn(),
  composeDown: vi.fn(),
  composeStatus: vi.fn(),
  waitForHealthy: vi.fn(),
}));

vi.mock('../../src/store/drizzle/migrations.js', () => ({
  runMigrations: vi.fn(),
}));

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ storeUrl: 'postgresql://forja:forja@localhost:5432/forja', source: 'default' }),
  redactDsn: vi.fn().mockImplementation((url: string) => url),
}));

import {
  checkDockerAvailable,
  composeUp,
  composeDown,
  composeStatus,
  waitForHealthy,
} from '../../src/infra/docker.js';
import { runMigrations } from '../../src/store/drizzle/migrations.js';
import { loadConfig, redactDsn } from '../../src/config/loader.js';
import { infraCommand } from '../../src/cli/commands/infra.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockRedactDsn = vi.mocked(redactDsn);

// Typed mocks
const mockCheckDockerAvailable = checkDockerAvailable as ReturnType<typeof vi.fn>;
const mockComposeUp = composeUp as ReturnType<typeof vi.fn>;
const mockComposeDown = composeDown as ReturnType<typeof vi.fn>;
const mockComposeStatus = composeStatus as ReturnType<typeof vi.fn>;
const mockWaitForHealthy = waitForHealthy as ReturnType<typeof vi.fn>;
const mockRunMigrations = runMigrations as ReturnType<typeof vi.fn>;

// Helper: capture console output and process.exit during a command action
async function runAction(action: string): Promise<{
  logs: string[];
  errors: string[];
  exitCode: number | undefined;
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  const spyLog = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
  const spyError = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.join(' '));
  });
  const spyExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code as number;
    // Throw to stop action execution after exit is called
    throw new Error(`process.exit(${code})`);
  });

  try {
    // Invoke the commander action directly by parsing the argv
    await infraCommand.parseAsync(['node', 'forja', action]);
  } catch (err) {
    // Swallow errors triggered by our mocked process.exit
    const msg = (err as Error).message ?? '';
    if (!msg.startsWith('process.exit(')) {
      throw err;
    }
  } finally {
    spyLog.mockRestore();
    spyError.mockRestore();
    spyExit.mockRestore();
  }

  return { logs, errors, exitCode };
}

describe('infraCommand integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: Docker is available
    mockCheckDockerAvailable.mockResolvedValue(undefined);
    mockComposeUp.mockResolvedValue(undefined);
    mockComposeDown.mockResolvedValue(undefined);
    mockComposeStatus.mockResolvedValue('');
    mockWaitForHealthy.mockResolvedValue(undefined);
    mockRunMigrations.mockResolvedValue(undefined);
    // Default loadConfig returns the default connection string
    mockLoadConfig.mockResolvedValue({ storeUrl: 'postgresql://forja:forja@localhost:5432/forja', source: 'default' });
    // redactDsn passes through the URL unchanged in tests
    mockRedactDsn.mockImplementation((url: string) => url);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('forja infra up', () => {
    it('calls checkDockerAvailable', async () => {
      await runAction('up');
      expect(mockCheckDockerAvailable).toHaveBeenCalledOnce();
    });

    it('calls composeUp', async () => {
      await runAction('up');
      expect(mockComposeUp).toHaveBeenCalledOnce();
    });

    it('calls waitForHealthy with "postgres"', async () => {
      await runAction('up');
      expect(mockWaitForHealthy).toHaveBeenCalledWith('postgres');
    });

    it('calls runMigrations with DATABASE_URL env var when set', async () => {
      mockLoadConfig.mockResolvedValueOnce({ storeUrl: 'postgresql://custom:pass@localhost:5432/customdb', source: 'env' });
      await runAction('up');
      expect(mockRunMigrations).toHaveBeenCalledWith('postgresql://custom:pass@localhost:5432/customdb');
    });

    it('calls runMigrations with default connection string when DATABASE_URL not set', async () => {
      delete process.env.DATABASE_URL;
      await runAction('up');
      expect(mockRunMigrations).toHaveBeenCalledWith('postgresql://forja:forja@localhost:5432/forja');
    });

    it('prints the postgres ready success message', async () => {
      delete process.env.DATABASE_URL;
      const { logs } = await runAction('up');
      const allOutput = logs.join('\n');
      expect(allOutput).toContain('postgresql://forja:forja@localhost:5432/forja');
    });

    it('does not exit with code 1 on success', async () => {
      const { exitCode } = await runAction('up');
      expect(exitCode).toBeUndefined();
    });
  });

  describe('forja infra down', () => {
    it('calls checkDockerAvailable', async () => {
      await runAction('down');
      expect(mockCheckDockerAvailable).toHaveBeenCalledOnce();
    });

    it('calls composeDown', async () => {
      await runAction('down');
      expect(mockComposeDown).toHaveBeenCalledOnce();
    });

    it('prints "Postgres encerrado"', async () => {
      const { logs } = await runAction('down');
      expect(logs.join('\n')).toContain('Postgres encerrado');
    });

    it('does not call composeUp or runMigrations', async () => {
      await runAction('down');
      expect(mockComposeUp).not.toHaveBeenCalled();
      expect(mockRunMigrations).not.toHaveBeenCalled();
    });
  });

  describe('forja infra status', () => {
    it('calls checkDockerAvailable', async () => {
      await runAction('status');
      expect(mockCheckDockerAvailable).toHaveBeenCalledOnce();
    });

    it('calls composeStatus', async () => {
      await runAction('status');
      expect(mockComposeStatus).toHaveBeenCalledOnce();
    });

    it('prints the output returned by composeStatus', async () => {
      mockComposeStatus.mockResolvedValue('NAME   STATUS\npostgres   running');
      const { logs } = await runAction('status');
      expect(logs.join('\n')).toContain('NAME   STATUS');
    });

    it('prints fallback message when composeStatus returns empty string', async () => {
      mockComposeStatus.mockResolvedValue('');
      const { logs } = await runAction('status');
      expect(logs.join('\n')).toContain('Nenhum serviço em execução');
    });
  });

  describe('forja infra <unknown>', () => {
    it('prints error message mentioning the unknown action', async () => {
      const { errors } = await runAction('restart');
      expect(errors.join('\n')).toContain('restart');
    });

    it('prints the valid options (up, down, status)', async () => {
      const { errors } = await runAction('restart');
      expect(errors.join('\n')).toContain('up');
      expect(errors.join('\n')).toContain('down');
      expect(errors.join('\n')).toContain('status');
    });

    it('exits with code 1', async () => {
      const { exitCode } = await runAction('restart');
      expect(exitCode).toBe(1);
    });
  });

  describe('when checkDockerAvailable throws', () => {
    beforeEach(() => {
      mockCheckDockerAvailable.mockRejectedValue(
        new Error('Docker não encontrado. Instale Docker Desktop em https://docs.docker.com/get-docker/'),
      );
    });

    it('prints the error message', async () => {
      const { errors } = await runAction('up');
      expect(errors.join('\n')).toContain('Docker não encontrado');
    });

    it('exits with code 1', async () => {
      const { exitCode } = await runAction('up');
      expect(exitCode).toBe(1);
    });

    it('does not call composeUp', async () => {
      await runAction('up');
      expect(mockComposeUp).not.toHaveBeenCalled();
    });

    it('does not call composeDown when action is down', async () => {
      await runAction('down');
      expect(mockComposeDown).not.toHaveBeenCalled();
    });

    it('does not call composeStatus when action is status', async () => {
      await runAction('status');
      expect(mockComposeStatus).not.toHaveBeenCalled();
    });
  });
});
