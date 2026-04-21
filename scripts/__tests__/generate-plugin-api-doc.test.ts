import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { generatePluginApiDoc, extractJSDoc, buildMarkdown, MAIN_INTERFACES } from '../generate-plugin-api-doc.js';
import * as ts from 'typescript';

const SCRIPT = path.resolve(__dirname, '../generate-plugin-api-doc.ts');

// ---------------------------------------------------------------------------
// Minimal fixture source
// ---------------------------------------------------------------------------

const FIXTURE_SOURCE = `
/**
 * Severity level for findings.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * A simple plugin command.
 *
 * Implement this to add a CLI subcommand.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 *
 * @example
 * \`\`\`ts
 * export const cmd: SimpleCommand = {
 *   id: 'my:cmd',
 *   async run() { return { exitCode: 0 }; },
 * };
 * \`\`\`
 *
 * @remarks
 * - \`run\` must never throw.
 * - \`id\` must be unique.
 */
export interface SimpleCommand {
  id: string;
  run(): Promise<{ exitCode: number }>;
}
`;

// Shared fixture path — written once, reused across tests
let sharedFixturePath: string;
let sharedFixtureDir: string;

beforeAll(() => {
  sharedFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-plugin-api-test-'));
  sharedFixturePath = path.join(sharedFixtureDir, 'types.ts');
  fs.writeFileSync(sharedFixturePath, FIXTURE_SOURCE, 'utf-8');
});

afterAll(() => {
  fs.rmSync(sharedFixtureDir, { recursive: true, force: true });
});

function writeFixture(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-plugin-api-test-'));
  const filePath = path.join(tmpDir, 'types.ts');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function runScript(args: string[], cwd: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`npx tsx ${SCRIPT} ${args.join(' ')}`, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env },
    });
    return { stdout, stderr: '', code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.status ?? 1 };
  }
}

// ---------------------------------------------------------------------------
// generatePluginApiDoc — happy path
// ---------------------------------------------------------------------------

describe('generatePluginApiDoc', () => {
  it('generates a non-empty markdown document from fixture source', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('# Forja Plugin API');
    expect(output).toContain('## Getting Started');
    expect(output).toContain('## Stability & Versioning');
  });

  it('includes a section for each exported interface and type', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('## `SimpleCommand`');
    expect(output).toContain('## `Severity`');
  });

  it('emits the signature block for each entry', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('```typescript');
    expect(output).toContain('interface SimpleCommand');
  });

  it('includes description from JSDoc', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('Implement this to add a CLI subcommand.');
  });

  it('includes @example block', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('### Example');
    expect(output).toContain('my:cmd');
  });

  it('includes @remarks block', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('### Remarks');
    expect(output).toContain('run` must never throw');
  });

  it('includes @since tag', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('*Since: v1.0.0*');
  });

  it('adds the generated-file notice', () => {
    const output = generatePluginApiDoc(sharedFixturePath);
    expect(output).toContain('Do not edit manually');
    expect(output).toContain('plugin-api:gen');
  });

  it('excludes non-exported interfaces from the doc', () => {
    const filePath = writeFixture(FIXTURE_SOURCE + `\ninterface InternalThing { secret: string; }\n`);
    const output = generatePluginApiDoc(filePath);
    expect(output).not.toContain('## `InternalThing`');
  });

  it('throws when the source file does not exist (ENOENT)', () => {
    expect(() => generatePluginApiDoc('/nonexistent/path/types.ts')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildMarkdown — edge cases
// ---------------------------------------------------------------------------

describe('buildMarkdown', () => {
  it('places main interfaces before auxiliary types', () => {
    const entries = [
      { name: 'Severity', kind: 'type' as const, description: 'severity', signature: "type Severity = 'low';" },
      { name: MAIN_INTERFACES[0], kind: 'interface' as const, description: 'a command', signature: 'interface Command {}' },
    ];
    const output = buildMarkdown(entries);
    const commandIdx = output.indexOf(`## \`${MAIN_INTERFACES[0]}\``);
    const severityIdx = output.indexOf('## `Severity`');
    expect(commandIdx).toBeLessThan(severityIdx);
  });

  it('returns a valid document with no entries (empty array)', () => {
    const output = buildMarkdown([]);
    expect(output).toContain('# Forja Plugin API');
    expect(output).toContain('## Getting Started');
    // No interface sections
    expect(output).not.toContain('### Signature');
  });
});

// ---------------------------------------------------------------------------
// extractJSDoc
// ---------------------------------------------------------------------------

describe('extractJSDoc', () => {
  it('extracts description and tags from a JSDoc node', () => {
    const src = `/** Description here. @since v1.0.0 */\nexport interface Foo {}`;
    const sourceFile = ts.createSourceFile('test.ts', src, ts.ScriptTarget.Latest, true);
    let result: { description: string; tags: Record<string, string> } | undefined;

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isInterfaceDeclaration(node)) result = extractJSDoc(node);
    });

    expect(result).toBeDefined();
    expect(result!.description).toContain('Description here');
    expect(result!.tags['since']).toBe('v1.0.0');
  });

  it('accumulates repeated tags rather than silently overwriting', () => {
    const src = `/**\n * @example first\n * @example second\n */\nexport interface Bar {}`;
    const sourceFile = ts.createSourceFile('test.ts', src, ts.ScriptTarget.Latest, true);
    let result: { description: string; tags: Record<string, string> } | undefined;

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isInterfaceDeclaration(node)) result = extractJSDoc(node);
    });

    expect(result).toBeDefined();
    expect(result!.tags['example']).toContain('first');
    expect(result!.tags['example']).toContain('second');
  });
});

// ---------------------------------------------------------------------------
// CLI — --check mode
// ---------------------------------------------------------------------------

describe('CLI --check mode', () => {
  it('exits 0 when PLUGIN-API.md matches the generated output', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-check-test-'));
    const srcDir = path.join(tmpDir, 'src', 'plugin');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.copyFileSync(sharedFixturePath, path.join(srcDir, 'types.ts'));

    // Pre-generate the doc so it matches
    const doc = generatePluginApiDoc(sharedFixturePath);
    fs.writeFileSync(path.join(tmpDir, 'PLUGIN-API.md'), doc, 'utf-8');

    const result = runScript(['--check'], tmpDir);
    expect(result.code).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 2 when PLUGIN-API.md is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-check-test-'));
    const srcDir = path.join(tmpDir, 'src', 'plugin');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.copyFileSync(sharedFixturePath, path.join(srcDir, 'types.ts'));

    const result = runScript(['--check'], tmpDir);
    expect(result.code).toBe(2);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 2 when PLUGIN-API.md is out of sync', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-check-test-'));
    const srcDir = path.join(tmpDir, 'src', 'plugin');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.copyFileSync(sharedFixturePath, path.join(srcDir, 'types.ts'));
    fs.writeFileSync(path.join(tmpDir, 'PLUGIN-API.md'), '# stale content\n', 'utf-8');

    const result = runScript(['--check'], tmpDir);
    expect(result.code).toBe(2);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
