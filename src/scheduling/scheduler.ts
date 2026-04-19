import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { CronExpressionParser } from 'cron-parser';

export interface Schedule {
  id: string;
  command: string;
  cron: string;
  createdAt: string;
}

export const SUPPORTED_COMMANDS = [
  'audit:security',
  'audit:backend',
  'audit:frontend',
  'audit:database',
  'audit:run',
  'prune',
];

// Allow tests to override the storage path via env var
function schedulesPath(): string {
  return process.env.FORJA_SCHEDULES_PATH ?? join(homedir(), '.forja', 'schedules.json');
}

function isValidSchedule(s: unknown): s is Schedule {
  if (typeof s !== 'object' || s === null) return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.command === 'string' &&
    SUPPORTED_COMMANDS.includes(obj.command) &&
    typeof obj.cron === 'string' &&
    typeof obj.createdAt === 'string'
  );
}

async function readSchedules(): Promise<Schedule[]> {
  try {
    const raw = await readFile(schedulesPath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSchedule);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeSchedules(schedules: Schedule[]): Promise<void> {
  const dir = join(schedulesPath(), '..');
  await mkdir(dir, { recursive: true });
  const target = schedulesPath();
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(schedules, null, 2), 'utf-8');
  await rename(tmp, target);
}

export function validateCommand(command: string): void {
  if (!SUPPORTED_COMMANDS.includes(command)) {
    throw new Error(`Only these commands can be scheduled: audit:*, prune`);
  }
}

export function validateCron(expr: string): void {
  try {
    CronExpressionParser.parse(expr);
  } catch {
    throw new Error(`Invalid cron expression: "${expr}". Example: "0 2 * * 1" (Monday 2am)`);
  }
}

export function getNextRun(cronExpr: string): Date {
  return CronExpressionParser.parse(cronExpr).next().toDate();
}

export async function scheduleCommand(command: string, cronExpr: string): Promise<string> {
  validateCommand(command);
  validateCron(cronExpr);

  const schedules = await readSchedules();
  const id = `sched-${nanoid(6)}`;

  schedules.push({
    id,
    command,
    cron: cronExpr,
    createdAt: new Date().toISOString(),
  });

  await writeSchedules(schedules);
  return id;
}

export async function listSchedules(): Promise<Schedule[]> {
  return readSchedules();
}

export async function deleteSchedule(id: string): Promise<void> {
  const schedules = await readSchedules();
  const filtered = schedules.filter((s) => s.id !== id);
  if (filtered.length === schedules.length) {
    throw new Error(`Schedule not found: ${id}`);
  }
  await writeSchedules(filtered);
}
