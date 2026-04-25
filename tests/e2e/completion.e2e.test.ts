import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

const TSX = path.resolve('node_modules/.bin/tsx');
const RUNNER = path.resolve('tests/e2e/_completion-runner.ts');
const PROJECT_ROOT = path.resolve('.');

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCompletion(args: string[]): SpawnResult {
  const result = spawnSync(TSX, [RUNNER, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('forja completion bash', () => {
  it('exits 0', () => {
    expect(runCompletion(['bash']).exitCode).toBe(0);
  });

  it('stdout contains _forja_completion function', () => {
    const { stdout } = runCompletion(['bash']);
    expect(stdout).toContain('_forja_completion');
  });

  it('stdout contains complete -F _forja_completion forja', () => {
    const { stdout } = runCompletion(['bash']);
    expect(stdout).toContain('complete -F _forja_completion forja');
  });

  it('stderr contains install instructions', () => {
    const { stderr } = runCompletion(['bash']);
    expect(stderr).toContain('forja completion bash');
  });
});

describe('forja completion zsh', () => {
  it('exits 0', () => {
    expect(runCompletion(['zsh']).exitCode).toBe(0);
  });

  it('stdout starts with #compdef forja', () => {
    const { stdout } = runCompletion(['zsh']);
    expect(stdout).toContain('#compdef forja');
  });

  it('stdout contains compdef _forja forja', () => {
    const { stdout } = runCompletion(['zsh']);
    expect(stdout).toContain('compdef _forja forja');
  });

  it('stderr contains zsh install instructions', () => {
    const { stderr } = runCompletion(['zsh']);
    expect(stderr).toContain('~/.zsh/completions');
  });
});

describe('forja completion fish', () => {
  it('exits 0', () => {
    expect(runCompletion(['fish']).exitCode).toBe(0);
  });

  it('stdout starts with complete -c forja -f', () => {
    const { stdout } = runCompletion(['fish']);
    expect(stdout).toContain('complete -c forja -f');
  });

  it('stdout contains not __fish_seen_subcommand_from condition', () => {
    const { stdout } = runCompletion(['fish']);
    expect(stdout).toContain('not __fish_seen_subcommand_from');
  });

  it('stderr contains fish install instructions', () => {
    const { stderr } = runCompletion(['fish']);
    expect(stderr).toContain('~/.config/fish/completions/forja.fish');
  });
});

describe('forja completion invalid', () => {
  it('exits 1', () => {
    expect(runCompletion(['invalid']).exitCode).toBe(1);
  });

  it('stderr contains "unsupported shell"', () => {
    const { stderr } = runCompletion(['invalid']);
    expect(stderr).toContain('unsupported shell');
  });

  it('stderr lists supported shells', () => {
    const { stderr } = runCompletion(['invalid']);
    expect(stderr).toContain('bash');
    expect(stderr).toContain('zsh');
    expect(stderr).toContain('fish');
  });

  it('stdout is empty', () => {
    expect(runCompletion(['invalid']).stdout).toBe('');
  });
});
