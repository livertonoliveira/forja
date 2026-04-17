import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

// resolve relative to this source file location: src/cli/__tests__ → project root
const PROJECT_ROOT = resolve(new URL('.', import.meta.url).pathname, '../../..');
const BINARY = resolve(PROJECT_ROOT, 'bin/forja');
const TIMEOUT = 10_000;

describe('forja CLI integration', () => {
  it('--help shows all 12 subcommands', () => {
    const result = spawnSync('node', [BINARY, '--help'], { timeout: TIMEOUT, encoding: 'utf-8' });
    const output = result.stdout + result.stderr;

    const subcommands = [
      'run',
      'gate',
      'trace',
      'cost',
      'resume',
      'prune',
      'ui',
      'infra',
      'config',
      'hook',
      'schedule',
      'replay',
    ];

    for (const cmd of subcommands) {
      expect(output, `expected subcommand "${cmd}" in --help output`).toContain(cmd);
    }
  }, TIMEOUT);

  it('--version prints 0.1.0', () => {
    const result = spawnSync('node', [BINARY, '--version'], { timeout: TIMEOUT, encoding: 'utf-8' });
    const output = (result.stdout + result.stderr).trim();
    expect(output).toBe('0.1.0');
  }, TIMEOUT);

  it('run TEST-123 prints the stub message', () => {
    const result = spawnSync('node', [BINARY, 'run', 'TEST-123'], { timeout: TIMEOUT, encoding: 'utf-8' });
    const output = (result.stdout + result.stderr).trim();
    expect(output).toContain('[forja] run TEST-123');
    expect(output).toContain('ainda não implementado');
  }, TIMEOUT);

  it('hook pre-tool-use with empty stdin exits with code 0 and does not hang', () => {
    const result = spawnSync('node', [BINARY, 'hook', 'pre-tool-use'], {
      timeout: TIMEOUT,
      encoding: 'utf-8',
      input: '',
    });
    expect(result.status).toBe(0);
    expect(result.error).toBeUndefined();
  }, TIMEOUT);

  it('unknown command exits with code 1', () => {
    const result = spawnSync('node', [BINARY, 'unknowncmd'], { timeout: TIMEOUT, encoding: 'utf-8' });
    expect(result.status).toBe(1);
  }, TIMEOUT);
});
