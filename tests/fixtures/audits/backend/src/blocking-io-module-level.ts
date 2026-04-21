// false-positive guard: readFileSync at module level (startup I/O, not inside a handler — should NOT be flagged)
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('./config.json', 'utf8'));

export function getPort(): number {
  return (config as { port: number }).port ?? 3000;
}
