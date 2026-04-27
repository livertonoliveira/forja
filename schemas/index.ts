import { zodToJsonSchema } from 'zod-to-json-schema';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AuditFindingSchema, AuditReportSchema } from '../src/audits/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_ROOT = resolve(__dirname);

function write(outFile: string, content: unknown): void {
  const outPath = resolve(SCHEMAS_ROOT, outFile);
  if (!outPath.startsWith(SCHEMAS_ROOT + '/')) throw new Error(`Path traversal detected: ${outFile}`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(content, null, 2) + '\n');
  console.log(`Generated ${outFile}`);
}

write(
  'audit/audit-finding.json',
  zodToJsonSchema(AuditFindingSchema, { name: 'AuditFinding', target: 'jsonSchema7' }),
);

write(
  'audit/audit-report.json',
  zodToJsonSchema(AuditReportSchema, {
    name: 'AuditReport',
    target: 'jsonSchema7',
    definitions: { AuditFinding: AuditFindingSchema },
  }),
);
