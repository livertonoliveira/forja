import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { completionCommand } from '../commands/completion.js';

function getArgumentNames(command: typeof completionCommand): string[] {
  return command.registeredArguments.map((a) => a.name());
}

describe('completionCommand — metadata', () => {
  it('has name "completion"', () => {
    expect(completionCommand.name()).toBe('completion');
  });

  it('has a non-empty description', () => {
    expect(completionCommand.description()).toBeTruthy();
    expect(completionCommand.description().length).toBeGreaterThan(0);
  });

  it('registers required <shell> argument', () => {
    const argNames = getArgumentNames(completionCommand);
    expect(argNames).toContain('shell');
  });

  it('<shell> argument is required (not optional)', () => {
    const shellArg = completionCommand.registeredArguments.find((a) => a.name() === 'shell');
    expect(shellArg).toBeDefined();
    expect(shellArg?.required).toBe(true);
  });
});

describe('completionCommand — action: valid shells', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bash: writes non-empty completion script to stdout containing bash syntax', async () => {
    await completionCommand.parseAsync(['bash'], { from: 'user' });

    const stdoutOutput = vi.mocked(process.stdout.write).mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput.length).toBeGreaterThan(0);
    expect(stdoutOutput).toMatch(/compgen|complete\s+-F/);
  });

  it('bash: writes install instructions to stderr', async () => {
    await completionCommand.parseAsync(['bash'], { from: 'user' });

    const stderrOutput = vi.mocked(process.stderr.write).mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput.length).toBeGreaterThan(0);
  });

  it('zsh: stdout starts with "#compdef forja"', async () => {
    await completionCommand.parseAsync(['zsh'], { from: 'user' });

    const stdoutOutput = vi.mocked(process.stdout.write).mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput.trimStart()).toMatch(/^#compdef forja/);
  });

  it('zsh: writes install instructions to stderr', async () => {
    await completionCommand.parseAsync(['zsh'], { from: 'user' });

    const stderrOutput = vi.mocked(process.stderr.write).mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput.length).toBeGreaterThan(0);
  });

  it('fish: stdout starts with "complete -c forja -f"', async () => {
    await completionCommand.parseAsync(['fish'], { from: 'user' });

    const stdoutOutput = vi.mocked(process.stdout.write).mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput.trimStart()).toMatch(/^complete -c forja -f/);
  });

  it('fish: writes install instructions to stderr', async () => {
    await completionCommand.parseAsync(['fish'], { from: 'user' });

    const stderrOutput = vi.mocked(process.stderr.write).mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput.length).toBeGreaterThan(0);
  });
});

describe('completionCommand — action: invalid shell', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes "unsupported shell" error to stderr', async () => {
    await expect(
      completionCommand.parseAsync(['invalid'], { from: 'user' }),
    ).rejects.toThrow('process.exit(1)');

    const stderrOutput = vi.mocked(process.stderr.write).mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('unsupported shell');
  });

  it('calls process.exit(1)', async () => {
    await expect(
      completionCommand.parseAsync(['invalid'], { from: 'user' }),
    ).rejects.toThrow();

    expect(vi.mocked(process.exit)).toHaveBeenCalledWith(1);
  });

  it('does not write anything to stdout', async () => {
    await expect(
      completionCommand.parseAsync(['invalid'], { from: 'user' }),
    ).rejects.toThrow();

    expect(vi.mocked(process.stdout.write)).not.toHaveBeenCalled();
  });
});
