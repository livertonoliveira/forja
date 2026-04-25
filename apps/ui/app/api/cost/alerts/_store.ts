import fs from 'fs/promises';
import path from 'path';

export interface AlertRecord {
  id: string;
  [key: string]: unknown;
}

export interface AlertsFile {
  alerts: AlertRecord[];
}

export const ALERTS_PATH = path.resolve(process.cwd(), '..', '..', 'forja', 'alerts.json');

export async function readAlertsFile(): Promise<AlertsFile> {
  try {
    const raw = await fs.readFile(ALERTS_PATH, 'utf8');
    return JSON.parse(raw) as AlertsFile;
  } catch {
    return { alerts: [] };
  }
}

export async function writeAlertsFile(data: AlertsFile): Promise<void> {
  await fs.mkdir(path.dirname(ALERTS_PATH), { recursive: true });
  await fs.writeFile(ALERTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}
