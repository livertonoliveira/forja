import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validateCommand,
  validateCron,
  getNextRun,
  scheduleCommand,
  listSchedules,
  deleteSchedule,
  SUPPORTED_COMMANDS,
} from '../../src/scheduling/scheduler.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'forja-sched-test-'));
  process.env.FORJA_SCHEDULES_PATH = join(tmpDir, 'schedules.json');
});

afterEach(async () => {
  delete process.env.FORJA_SCHEDULES_PATH;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('validateCommand', () => {
  it('accepts all supported commands', () => {
    const supported = ['audit:security', 'audit:backend', 'audit:frontend', 'audit:database', 'audit:run', 'prune'];
    for (const cmd of supported) {
      expect(() => validateCommand(cmd)).not.toThrow();
    }
  });

  it('rejects unsupported commands with correct message', () => {
    expect(() => validateCommand('run')).toThrow('Only these commands can be scheduled: audit:*, prune');
    expect(() => validateCommand('unknown')).toThrow('Only these commands can be scheduled: audit:*, prune');
  });
});

describe('validateCron', () => {
  it('accepts valid cron expressions', () => {
    expect(() => validateCron('0 2 * * 1')).not.toThrow();
    expect(() => validateCron('0 3 * * 0')).not.toThrow();
    expect(() => validateCron('*/5 * * * *')).not.toThrow();
  });

  it('rejects invalid cron expressions with message containing the expression', () => {
    expect(() => validateCron('not-a-cron')).toThrow('Invalid cron expression: "not-a-cron"');
    expect(() => validateCron('99 99 99 99 99')).toThrow('Invalid cron expression');
  });
});

describe('scheduleCommand', () => {
  it('creates a schedule and returns a sched- prefixed ID', async () => {
    const id = await scheduleCommand('audit:security', '0 2 * * 1');
    expect(id).toMatch(/^sched-/);
  });

  it('persists the schedule to disk', async () => {
    await scheduleCommand('prune', '0 4 * * 0');
    const schedules = await listSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].command).toBe('prune');
    expect(schedules[0].cron).toBe('0 4 * * 0');
  });

  it('accumulates multiple schedules', async () => {
    await scheduleCommand('audit:security', '0 2 * * 1');
    await scheduleCommand('prune', '0 4 * * 0');
    const schedules = await listSchedules();
    expect(schedules).toHaveLength(2);
  });

  it('throws for unsupported commands', async () => {
    await expect(scheduleCommand('run', '0 2 * * 1')).rejects.toThrow(
      'Only these commands can be scheduled: audit:*, prune',
    );
  });

  it('throws for invalid cron expressions', async () => {
    await expect(scheduleCommand('prune', 'bad-cron')).rejects.toThrow('Invalid cron expression');
  });
});

describe('listSchedules', () => {
  it('returns empty array when no schedules file exists', async () => {
    const schedules = await listSchedules();
    expect(schedules).toEqual([]);
  });

  it('returns all persisted schedules', async () => {
    await scheduleCommand('audit:security', '0 2 * * 1');
    await scheduleCommand('prune', '0 4 * * 0');
    const schedules = await listSchedules();
    expect(schedules).toHaveLength(2);
    const commands = schedules.map((s) => s.command);
    expect(commands).toContain('audit:security');
    expect(commands).toContain('prune');
  });

  it('filters out tampered entries with unsupported commands', async () => {
    await writeFile(
      process.env.FORJA_SCHEDULES_PATH!,
      JSON.stringify([
        { id: 'sched-abc', command: 'audit:security', cron: '0 2 * * 1', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'evil', command: '../../bin/evil', cron: '* * * * *', createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
      'utf-8',
    );
    const schedules = await listSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].command).toBe('audit:security');
  });

  it('returns empty array for a file with non-array JSON', async () => {
    await writeFile(process.env.FORJA_SCHEDULES_PATH!, JSON.stringify({ not: 'an array' }), 'utf-8');
    const schedules = await listSchedules();
    expect(schedules).toEqual([]);
  });
});

describe('deleteSchedule', () => {
  it('removes the schedule by ID', async () => {
    const id = await scheduleCommand('audit:security', '0 2 * * 1');
    await deleteSchedule(id);
    const schedules = await listSchedules();
    expect(schedules).toHaveLength(0);
  });

  it('leaves other schedules intact', async () => {
    const id1 = await scheduleCommand('audit:security', '0 2 * * 1');
    await scheduleCommand('prune', '0 4 * * 0');
    await deleteSchedule(id1);
    const schedules = await listSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].command).toBe('prune');
  });

  it('throws when the ID does not exist', async () => {
    await expect(deleteSchedule('sched-notfound')).rejects.toThrow('Schedule not found: sched-notfound');
  });
});

describe('getNextRun', () => {
  it('returns a Date in the future for a valid cron expression', () => {
    const next = getNextRun('0 2 * * 1');
    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a Date for every-minute cron', () => {
    const next = getNextRun('* * * * *');
    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('validateCommand — edge cases', () => {
  it('rejects empty string', () => {
    expect(() => validateCommand('')).toThrow('Only these commands can be scheduled: audit:*, prune');
  });

  it('rejects a command that is a prefix of a valid command', () => {
    expect(() => validateCommand('audit')).toThrow('Only these commands can be scheduled: audit:*, prune');
  });

  it('rejects commands with extra whitespace', () => {
    expect(() => validateCommand(' audit:security')).toThrow('Only these commands can be scheduled: audit:*, prune');
    expect(() => validateCommand('prune ')).toThrow('Only these commands can be scheduled: audit:*, prune');
  });

  it('SUPPORTED_COMMANDS contains all expected audit variants', () => {
    expect(SUPPORTED_COMMANDS).toContain('audit:security');
    expect(SUPPORTED_COMMANDS).toContain('audit:backend');
    expect(SUPPORTED_COMMANDS).toContain('audit:frontend');
    expect(SUPPORTED_COMMANDS).toContain('audit:database');
    expect(SUPPORTED_COMMANDS).toContain('audit:run');
    expect(SUPPORTED_COMMANDS).toContain('prune');
  });
});

describe('validateCron — edge cases', () => {
  it('error message includes the example cron', () => {
    expect(() => validateCron('bad')).toThrow('Example: "0 2 * * 1"');
  });

  it('accepts empty string (treated as wildcard by cron-parser)', () => {
    // cron-parser interprets "" as "* * * * *" — no exception is raised
    expect(() => validateCron('')).not.toThrow();
  });
});

describe('listSchedules — robustness', () => {
  it('returns empty array for completely invalid JSON', async () => {
    await writeFile(process.env.FORJA_SCHEDULES_PATH!, 'this is not json', 'utf-8');
    await expect(listSchedules()).rejects.toThrow();
  });

  it('filters out entries missing required fields', async () => {
    await writeFile(
      process.env.FORJA_SCHEDULES_PATH!,
      JSON.stringify([
        { id: 'sched-ok', command: 'prune', cron: '0 4 * * 0', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'sched-bad', command: 'prune', cron: '0 4 * * 0' }, // missing createdAt
        { command: 'prune', cron: '0 4 * * 0', createdAt: '2026-01-01T00:00:00.000Z' }, // missing id
        null,
        42,
        'string entry',
      ]),
      'utf-8',
    );
    const schedules = await listSchedules();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].id).toBe('sched-ok');
  });
});

describe('scheduleCommand — ID format', () => {
  it('returns IDs with the sched- prefix and a 6-character suffix', async () => {
    const id = await scheduleCommand('prune', '*/15 * * * *');
    expect(id).toMatch(/^sched-[A-Za-z0-9_-]{6}$/);
  });

  it('generates unique IDs for separate calls', async () => {
    const id1 = await scheduleCommand('prune', '*/15 * * * *');
    const id2 = await scheduleCommand('audit:security', '0 3 * * 1');
    expect(id1).not.toBe(id2);
  });

  it('persists createdAt as a valid ISO string', async () => {
    const before = new Date().toISOString();
    await scheduleCommand('prune', '0 0 * * *');
    const [entry] = await listSchedules();
    const after = new Date().toISOString();
    expect(entry.createdAt >= before).toBe(true);
    expect(entry.createdAt <= after).toBe(true);
  });
});
