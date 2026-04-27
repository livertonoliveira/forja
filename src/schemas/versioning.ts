export const CURRENT_SCHEMA_VERSION = '1.0';

const VERSION_RE = /^(\d+)\.(\d+)$/;

export function parseSchemaVersion(s: string): { major: number; minor: number } {
  const match = VERSION_RE.exec(s);
  if (!match) {
    throw new Error(`Invalid schemaVersion format: "${s}". Expected "major.minor".`);
  }
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) };
}

export function isCompatible(declared: string, current: string): boolean {
  const d = parseSchemaVersion(declared);
  const c = parseSchemaVersion(current);
  return d.major === c.major;
}
