import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { completionCommand } from '../commands/completion.js';

// Helper: get argument names from the command
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
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('bash: writes non-empty completion script to stdout containing bash syntax', async () => {
    await completionCommand.parseAsync(['bash'], { from: 'user' });

    const stdoutOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput.length).toBeGreaterThan(0);
    // Bash completion scripts use `complete -F` or `compgen`
    expect(stdoutOutput).toMatch(/compgen|complete\s+-F/);
  });

  it('bash: writes install instructions to stderr', async () => {
    await completionCommand.parseAsync(['bash'], { from: 'user' });

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput.length).toBeGreaterThan(0);
  });

  it('zsh: stdout starts with "#compdef forja"', async () => {
    await completionCommand.parseAsync(['zsh'], { from: 'user' });

    const stdoutOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput.trimStart()).toMatch(/^#compdef forja/);
  });

  it('zsh: writes install instructions to stderr', async () => {
    await completionCommand.parseAsync(['zsh'], { from: 'user' });

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput.length).toBeGreaterThan(0);
  });

  it('fish: stdout starts with "complete -c forja -f"', async () => {
    await completionCommand.parseAsync(['fish'], { from: 'user' });

    const stdoutOutput = stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput.trimStart()).toMatch(/^complete -c forja -f/);
  });

  it('fish: writes install instructions to stderr', async () => {
    await completionCommand.parseAsync(['fish'], { from: 'user' });

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput.length).toBeGreaterThan(0);
  });
});

describe('completionCommand — action: invalid shell', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      throw new Error(`process.exit(${_code})`);
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('writes "unsupported shell" error to stderr', async () => {
    await expect(
      completionCommand.parseAsync(['invalid'], { from: 'user' }),
    ).rejects.toThrow('process.exit(1)');

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('unsupported shell');
  });

  it('calls process.exit(1)', async () => {
    await expect(
      completionCommand.parseAsync(['invalid'], { from: 'user' }),
    ).rejects.toThrow();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not write anything to stdout', async () => {
    await expect(
      completionCommand.parseAsync(['invalid'], { from: 'user' }),
    ).rejects.toThrow();

    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
