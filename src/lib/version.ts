import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

export function readVersion(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const rel of ['../VERSION', '../../VERSION']) {
    try {
      return readFileSync(resolve(dir, rel), 'utf-8').trim();
    } catch {
      // try next path
    }
  }
  return '0.0.0';
}
