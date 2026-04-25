import { describe, it, expect } from 'vitest';
import { generateBashCompletion, generateZshCompletion, generateFishCompletion } from '../completion.js';
import { commandRegistry } from '../help/index.js';

// The real registry is populated by the side-effect imports in help/index.ts
// We assert against at least these two well-known commands to keep the tests stable.
const KNOWN_COMMANDS = ['run', 'gate'];

describe('generateBashCompletion()', () => {
  it('returns a string', () => {
    expect(typeof generateBashCompletion()).toBe('string');
  });

  it('contains the _forja_completion() function definition', () => {
    expect(generateBashCompletion()).toContain('_forja_completion()');
  });

  it('ends with `complete -F _forja_completion forja`', () => {
    const output = generateBashCompletion();
    expect(output).toContain('complete -F _forja_completion forja');
  });

  it.each(KNOWN_COMMANDS)('contains known command "%s" in the commands list', (name) => {
    expect(generateBashCompletion()).toContain(name);
  });

  it('output ends with a newline', () => {
    expect(generateBashCompletion().endsWith('\n')).toBe(true);
  });
});

describe('generateZshCompletion()', () => {
  it('returns a string', () => {
    expect(typeof generateZshCompletion()).toBe('string');
  });

  it('starts with `#compdef forja`', () => {
    expect(generateZshCompletion().startsWith('#compdef forja')).toBe(true);
  });

  it('contains the _forja() function definition', () => {
    expect(generateZshCompletion()).toContain('_forja()');
  });

  it("contains `_describe 'command' commands`", () => {
    expect(generateZshCompletion()).toContain("_describe 'command' commands");
  });

  it('ends with `compdef _forja forja`', () => {
    expect(generateZshCompletion()).toContain('compdef _forja forja');
  });

  it.each(KNOWN_COMMANDS)('known command "%s" appears in \'<name>:<desc>\' format', (name) => {
    expect(generateZshCompletion()).toContain(`'${name}:`);
  });

  it('output ends with a newline', () => {
    expect(generateZshCompletion().endsWith('\n')).toBe(true);
  });
});

describe('generateFishCompletion()', () => {
  it('returns a string', () => {
    expect(typeof generateFishCompletion()).toBe('string');
  });

  it('starts with `complete -c forja -f`', () => {
    expect(generateFishCompletion().startsWith('complete -c forja -f')).toBe(true);
  });

  it.each(KNOWN_COMMANDS)(
    'contains a complete line with -n not __fish_seen_subcommand_from and -a "%s"',
    (name) => {
      expect(generateFishCompletion()).toContain(
        `-n 'not __fish_seen_subcommand_from`,
      );
      expect(generateFishCompletion()).toContain(`-a "${name}"`);
    },
  );

  it.each(KNOWN_COMMANDS)('known command "%s" appears in the output', (name) => {
    expect(generateFishCompletion()).toContain(name);
  });

  it('output ends with a newline', () => {
    expect(generateFishCompletion().endsWith('\n')).toBe(true);
  });
});

describe('registry is populated', () => {
  it('commandRegistry has at least one entry', () => {
    expect(commandRegistry.size).toBeGreaterThan(0);
  });

  it.each(KNOWN_COMMANDS)('commandRegistry contains "%s"', (name) => {
    expect(commandRegistry.has(name)).toBe(true);
  });
});
