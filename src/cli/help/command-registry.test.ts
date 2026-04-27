import { describe, it, expect } from 'vitest';
import { commandRegistry } from './command-registry.js';
import './index.js';

const EXPECTED_COMMANDS = [
  'completion', 'config', 'cost', 'doctor', 'gate', 'help', 'hook', 'infra', 'migrate',
  'plugins', 'policies', 'prune', 'replay', 'resume', 'run',
  'schedule', 'setup', 'trace', 'ui',
];

describe('command-registry', () => {
  it('has an entry for every CLI command', () => {
    for (const name of EXPECTED_COMMANDS) {
      expect(commandRegistry.has(name), `missing registry entry for "${name}"`).toBe(true);
    }
  });

  it(`registers exactly ${EXPECTED_COMMANDS.length} commands`, () => {
    expect(commandRegistry.size).toBe(19);
  });

  it('each entry has required fields', () => {
    for (const [name, entry] of commandRegistry) {
      expect(entry.name, `${name}.name`).toBe(name);
      expect(entry.description, `${name}.description`).toBeTruthy();
      expect(entry.usage, `${name}.usage`).toContain(`forja ${name}`);
      expect(Array.isArray(entry.examples), `${name}.examples is array`).toBe(true);
      expect(entry.examples.length, `${name} has at least one example`).toBeGreaterThan(0);
      expect(Array.isArray(entry.flags), `${name}.flags is array`).toBe(true);
    }
  });

  it('all example commands reference the correct command name', () => {
    for (const [name, entry] of commandRegistry) {
      for (const ex of entry.examples) {
        expect(ex.cmd, `${name} example starts with "forja ${name}"`).toMatch(
          new RegExp(`^forja ${name}`)
        );
        expect(ex.description, `${name} example has description`).toBeTruthy();
      }
    }
  });
});
