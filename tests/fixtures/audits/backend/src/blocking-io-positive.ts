// positive fixture: sync readFileSync inside async handler
import { readFileSync } from 'node:fs';

async function getConfig() {
  const data = readFileSync('/etc/app/config.json', 'utf8');
  return JSON.parse(data);
}

export { getConfig };
