import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export type ConfigSource = 'env' | 'project-file' | 'user-file' | 'default';

export interface LoadedConfig {
  storeUrl: string;
  retentionDays: number;
  source: ConfigSource;
}

interface StoredConfig {
  storeUrl: string;
  retentionDays?: number;
}

const DEFAULT_STORE_URL = 'postgresql://forja:forja@localhost:5432/forja';
const PROJECT_CONFIG_PATH = path.resolve('forja/.forja-config.json');
const USER_CONFIG_PATH = path.join(os.homedir(), '.forja', 'config.json');

interface ConfigFile {
  storeUrl?: string;
  retentionDays?: number;
}

async function readJsonFile(filePath: string): Promise<ConfigFile | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ConfigFile;
  } catch {
    return null;
  }
}

export function redactDsn(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '***';
    return parsed.toString();
  } catch {
    return url;
  }
}

let _configCache: LoadedConfig | undefined;

export async function loadConfig(): Promise<LoadedConfig> {
  if (_configCache) return _configCache;

  let result: LoadedConfig;

  const [projectConfig, userConfig] = await Promise.all([
    readJsonFile(PROJECT_CONFIG_PATH),
    readJsonFile(USER_CONFIG_PATH),
  ]);
  const retentionDays = projectConfig?.retentionDays ?? userConfig?.retentionDays ?? 90;

  if (process.env.FORJA_STORE_URL) {
    result = { storeUrl: process.env.FORJA_STORE_URL, retentionDays, source: 'env' };
  } else {
    if (projectConfig?.storeUrl) {
      result = { storeUrl: projectConfig.storeUrl, retentionDays, source: 'project-file' };
    } else if (userConfig?.storeUrl) {
      result = { storeUrl: userConfig.storeUrl, retentionDays, source: 'user-file' };
    } else {
      result = { storeUrl: DEFAULT_STORE_URL, retentionDays, source: 'default' };
    }
  }

  _configCache = result;
  return _configCache;
}

export function clearConfigCache(): void {
  _configCache = undefined;
}

const WRITABLE_KEYS: Partial<Record<string, keyof StoredConfig>> = {
  store_url: 'storeUrl',
};

export async function setConfigValue(key: string, value: string): Promise<void> {
  const dir = path.dirname(USER_CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });

  let existing: ConfigFile = {};
  try {
    const content = await fs.readFile(USER_CONFIG_PATH, 'utf-8');
    existing = JSON.parse(content) as ConfigFile;
  } catch {
    // file doesn't exist yet, start fresh
  }

  const mappedKey = WRITABLE_KEYS[key];
  if (mappedKey) {
    (existing as Record<string, unknown>)[mappedKey] = value;
  } else {
    throw new Error(`Unknown config key: ${key}`);
  }

  await fs.writeFile(USER_CONFIG_PATH, JSON.stringify(existing, null, 2) + '\n', { mode: 0o600 });
}
