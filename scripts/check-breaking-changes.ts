/**
 * check-breaking-changes.ts
 *
 * Detects breaking changes in public Zod schemas by comparing serialized
 * JSON Schema snapshots stored in tests/fixtures/public-api/.
 *
 * Usage:
 *   tsx scripts/check-breaking-changes.ts            # compare mode
 *   tsx scripts/check-breaking-changes.ts --generate # snapshot mode
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodType } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JsonSchema = Record<string, unknown>;

export interface BreakingChange {
  schema: string;
  kind:
    | 'schema_removed'
    | 'field_removed'
    | 'field_made_required'
    | 'type_changed'
    | 'enum_value_removed'
    | 'constraint_stricter';
  path: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const fixturesBase = path.join(projectRoot, 'tests', 'fixtures', 'public-api');

const _pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as { version: string };
const currentVersion = _pkg.version;

function getVersion(): string {
  return currentVersion;
}

function getMajor(version: string): number {
  return parseInt(version.split('.')[0], 10);
}

/** Returns the path to the latest versioned baseline directory, or null. */
function findLatestBaselineDir(): string | null {
  if (!fs.existsSync(fixturesBase)) return null;

  const entries = fs.readdirSync(fixturesBase, { withFileTypes: true });
  const versionDirs = entries
    .filter((e) => e.isDirectory() && /^v\d+\.\d+\.\d+$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => {
      const [aMaj, aMin, aPatch] = a.slice(1).split('.').map(Number);
      const [bMaj, bMin, bPatch] = b.slice(1).split('.').map(Number);
      if (aMaj !== bMaj) return bMaj - aMaj;
      if (aMin !== bMin) return bMin - aMin;
      return bPatch - aPatch;
    });

  if (versionDirs.length === 0) return null;
  return path.join(fixturesBase, versionDirs[0]);
}

// ---------------------------------------------------------------------------
// Core: schema serialization
// ---------------------------------------------------------------------------

export function serializeSchemas(schemas: Record<string, ZodType>): Record<string, JsonSchema> {
  const result: Record<string, JsonSchema> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    result[name] = zodToJsonSchema(schema, { name, errorMessages: false }) as JsonSchema;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core: breaking change detection
// ---------------------------------------------------------------------------

function getProps(schema: JsonSchema): Record<string, JsonSchema> {
  const props = schema['properties'];
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    return props as Record<string, JsonSchema>;
  }
  return {};
}

function getRequired(schema: JsonSchema): string[] {
  const req = schema['required'];
  if (Array.isArray(req)) return req as string[];
  return [];
}

function getEnum(schema: JsonSchema): unknown[] | null {
  const e = schema['enum'];
  if (Array.isArray(e)) return e;
  return null;
}

function getType(schema: JsonSchema): string | string[] | null {
  const t = schema['type'];
  if (typeof t === 'string' || Array.isArray(t)) return t as string | string[];
  return null;
}

function isTypeCompatible(baseType: string | string[] | null, curType: string | string[] | null): boolean {
  if (baseType === null && curType === null) return true;
  const baseSet = new Set(Array.isArray(baseType) ? baseType : baseType ? [baseType] : []);
  const curSet = new Set(Array.isArray(curType) ? curType : curType ? [curType] : []);
  // All base types must be present in current (removing a type is breaking)
  for (const t of baseSet) {
    if (!curSet.has(t)) return false;
  }
  return true;
}

function compareSchemaNode(
  schemaName: string,
  basePath: string,
  base: JsonSchema,
  cur: JsonSchema,
  findings: BreakingChange[],
): void {
  // Type changed
  const baseType = getType(base);
  const curType = getType(cur);
  if (!isTypeCompatible(baseType, curType)) {
    findings.push({
      schema: schemaName,
      kind: 'type_changed',
      path: basePath,
      details: `type changed from '${JSON.stringify(baseType)}' to '${JSON.stringify(curType)}'`,
    });
    return; // no point checking sub-fields if the whole type changed
  }

  // Enum values removed
  const baseEnum = getEnum(base);
  const curEnum = getEnum(cur);
  if (baseEnum !== null) {
    if (curEnum === null) {
      findings.push({
        schema: schemaName,
        kind: 'enum_value_removed',
        path: basePath,
        details: 'enum constraint removed entirely',
      });
    } else {
      for (const val of baseEnum) {
        if (!curEnum.includes(val)) {
          findings.push({
            schema: schemaName,
            kind: 'enum_value_removed',
            path: basePath,
            details: `enum value '${val}' removed`,
          });
        }
      }
    }
  }

  // String constraints
  if (baseType === 'string' || (Array.isArray(baseType) && baseType.includes('string'))) {
    const baseMin = base['minLength'] as number | undefined;
    const curMin = cur['minLength'] as number | undefined;
    if (baseMin !== undefined && curMin !== undefined && curMin > baseMin) {
      findings.push({
        schema: schemaName,
        kind: 'constraint_stricter',
        path: basePath,
        details: `minLength increased from ${baseMin} to ${curMin}`,
      });
    } else if (baseMin === undefined && curMin !== undefined && curMin > 0) {
      findings.push({
        schema: schemaName,
        kind: 'constraint_stricter',
        path: basePath,
        details: `minLength added: ${curMin}`,
      });
    }

    const basePat = base['pattern'];
    const curPat = cur['pattern'];
    if (basePat !== undefined && basePat !== curPat) {
      findings.push({
        schema: schemaName,
        kind: 'constraint_stricter',
        path: basePath,
        details: `pattern changed from '${basePat}' to '${curPat ?? '(removed)'}'`,
      });
    }
  }

  // Number constraints
  if (baseType === 'number' || baseType === 'integer' ||
      (Array.isArray(baseType) && (baseType.includes('number') || baseType.includes('integer')))) {
    const baseMin = base['minimum'] as number | undefined;
    const curMin = cur['minimum'] as number | undefined;
    if (baseMin !== undefined && curMin !== undefined && curMin > baseMin) {
      findings.push({
        schema: schemaName,
        kind: 'constraint_stricter',
        path: basePath,
        details: `minimum increased from ${baseMin} to ${curMin}`,
      });
    }

    const baseMax = base['maximum'] as number | undefined;
    const curMax = cur['maximum'] as number | undefined;
    if (baseMax !== undefined && curMax !== undefined && curMax < baseMax) {
      findings.push({
        schema: schemaName,
        kind: 'constraint_stricter',
        path: basePath,
        details: `maximum decreased from ${baseMax} to ${curMax}`,
      });
    }
  }

  // additionalProperties: absent/true → false is breaking
  const baseAP = base['additionalProperties'];
  const curAP = cur['additionalProperties'];
  const baseAllowsExtra = baseAP === undefined || baseAP === true;
  const curAllowsExtra = curAP === undefined || curAP === true;
  if (baseAllowsExtra && !curAllowsExtra) {
    findings.push({
      schema: schemaName,
      kind: 'constraint_stricter',
      path: basePath,
      details: 'additionalProperties changed to false (was absent/true)',
    });
  }

  // Object properties
  const baseProps = getProps(base);
  const curProps = getProps(cur);
  const baseReq = new Set(getRequired(base));
  const curReq = new Set(getRequired(cur));

  for (const propName of Object.keys(baseProps)) {
    const propPath = basePath ? `${basePath}.${propName}` : propName;
    if (!(propName in curProps)) {
      findings.push({
        schema: schemaName,
        kind: 'field_removed',
        path: propPath,
        details: `property '${propName}' removed`,
      });
    } else {
      // Recurse into property schema
      compareSchemaNode(schemaName, propPath, baseProps[propName], curProps[propName], findings);

      // Optional → required
      if (!baseReq.has(propName) && curReq.has(propName)) {
        findings.push({
          schema: schemaName,
          kind: 'field_made_required',
          path: propPath,
          details: `property '${propName}' changed from optional to required`,
        });
      }
    }
  }
}

function unwrapDefinitions(raw: JsonSchema, name: string): JsonSchema {
  const defs = (raw['definitions'] ?? raw['$defs']) as Record<string, JsonSchema> | undefined;
  if (defs && name in defs) return defs[name];
  return raw;
}

export function detectBreakingChanges(
  baseline: Record<string, JsonSchema>,
  current: Record<string, JsonSchema>,
): BreakingChange[] {
  const findings: BreakingChange[] = [];

  for (const schemaName of Object.keys(baseline)) {
    if (!(schemaName in current)) {
      findings.push({
        schema: schemaName,
        kind: 'schema_removed',
        path: '',
        details: `schema '${schemaName}' removed from public API`,
      });
      continue;
    }

    const base = unwrapDefinitions(baseline[schemaName], schemaName);
    const cur = unwrapDefinitions(current[schemaName], schemaName);

    compareSchemaNode(schemaName, '', base, cur, findings);
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function buildReport(findings: BreakingChange[], version: string, baselineVersion: string): string {
  const lines: string[] = [];
  lines.push('## Breaking Change Check');
  lines.push('');
  lines.push(`- **Current version:** ${version}`);
  lines.push(`- **Baseline version:** ${baselineVersion}`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('No breaking changes detected. Public API is backward-compatible.');
    return lines.join('\n');
  }

  lines.push(`**${findings.length} breaking change(s) detected:**`);
  lines.push('');
  lines.push('| Schema | Kind | Path | Details |');
  lines.push('|--------|------|------|---------|');
  for (const f of findings) {
    lines.push(`| \`${f.schema}\` | \`${f.kind}\` | \`${f.path || '(root)'}\` | ${f.details} |`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

async function loadZodSchemas(): Promise<Record<string, ZodType>> {
  const schemasPath = path.join(projectRoot, 'src', 'schemas', 'index.js');
  const schemas = (await import(schemasPath)) as Record<string, unknown>;
  const zodSchemas: Record<string, ZodType> = {};
  for (const [name, value] of Object.entries(schemas)) {
    if (value !== null && typeof value === 'object' && '_def' in (value as object)) {
      zodSchemas[name] = value as ZodType;
    }
  }
  return zodSchemas;
}

// ---------------------------------------------------------------------------
// Generate mode
// ---------------------------------------------------------------------------

async function generateBaseline(): Promise<void> {
  const version = getVersion();
  const targetDir = path.join(fixturesBase, `v${version}`);

  fs.mkdirSync(targetDir, { recursive: true });

  const zodSchemas = await loadZodSchemas();

  const serialized = serializeSchemas(zodSchemas);
  const schemaNames = Object.keys(serialized);

  for (const [name, schema] of Object.entries(serialized)) {
    const filePath = path.join(targetDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(schema, null, 2) + '\n', 'utf-8');
    process.stdout.write(`  wrote ${path.relative(projectRoot, filePath)}\n`);
  }

  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    schemas: schemaNames,
  };
  const manifestPath = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  process.stdout.write(`  wrote ${path.relative(projectRoot, manifestPath)}\n`);

  process.stdout.write(`\nBaseline generated at tests/fixtures/public-api/v${version}/\n`);
}

// ---------------------------------------------------------------------------
// Compare mode
// ---------------------------------------------------------------------------

async function compareWithBaseline(): Promise<void> {
  const version = getVersion();
  const baselineDir = findLatestBaselineDir();

  if (!baselineDir) {
    process.stdout.write(
      '## Breaking Change Check\n\nNo baseline found. Run `tsx scripts/check-breaking-changes.ts --generate` first.\n',
    );
    process.exit(0);
    return;
  }

  const baselineVersion = path.basename(baselineDir).slice(1); // strip leading 'v'

  // Load baseline schemas from JSON files (parallel reads)
  const manifestPath = path.join(baselineDir, 'manifest.json');
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8')) as { schemas: string[] };

  const baselineEntries = await Promise.all(
    manifest.schemas.map(async (name) => {
      const filePath = path.join(baselineDir, `${name}.json`);
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      return [name, JSON.parse(raw) as JsonSchema] as const;
    }),
  );
  const baseline = Object.fromEntries(baselineEntries);

  const zodSchemas = await loadZodSchemas();
  const current = serializeSchemas(zodSchemas);
  const findings = detectBreakingChanges(baseline, current);
  const report = buildReport(findings, version, baselineVersion);

  process.stdout.write(report + '\n');

  if (findings.length === 0) {
    process.exit(0);
    return;
  }

  // Allow breaking changes if the major version was bumped
  const baseMajor = getMajor(baselineVersion);
  const curMajor = getMajor(version);
  if (curMajor > baseMajor) {
    process.stdout.write(`\nMajor version bumped (${baseMajor} → ${curMajor}) — breaking changes are allowed.\n`);
    process.exit(0);
    return;
  }

  process.exit(2);
}

// ---------------------------------------------------------------------------
// Entry point — only runs when executed directly, not when imported
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--generate')) {
    generateBaseline().catch((err: unknown) => {
      process.stderr.write(`Error: ${String(err)}\n`);
      process.exit(1);
    });
  } else {
    compareWithBaseline().catch((err: unknown) => {
      process.stderr.write(`Error: ${String(err)}\n`);
      process.exit(1);
    });
  }
}
