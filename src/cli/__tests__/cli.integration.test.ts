import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// resolve relative to this source file location: src/cli/__tests__ → project root
const PROJECT_ROOT = resolve(new URL('.', import.meta.url).pathname, '../../..');
const BINARY = resolve(PROJECT_ROOT, 'bin/forja.js');
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

  it('--version prints the current package version', () => {
    const result = spawnSync('node', [BINARY, '--version'], { timeout: TIMEOUT, encoding: 'utf-8' });
    const output = (result.stdout + result.stderr).trim();
    const { version } = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(output).toBe(version);
  }, TIMEOUT);

  it('run TEST-123 starts the pipeline for the given issue', () => {
    const result = spawnSync('node', [BINARY, 'run', 'TEST-123'], { timeout: TIMEOUT, encoding: 'utf-8' });
    const output = (result.stdout + result.stderr).trim();
    expect(output).toContain('TEST-123');
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
