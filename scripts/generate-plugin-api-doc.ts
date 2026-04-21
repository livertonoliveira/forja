/**
 * generate-plugin-api-doc.ts
 *
 * Generates PLUGIN-API.md from JSDoc annotations in src/plugin/types.ts using
 * the TypeScript compiler API.
 *
 * Usage:
 *   tsx scripts/generate-plugin-api-doc.ts           # write mode
 *   tsx scripts/generate-plugin-api-doc.ts --check   # CI drift check (exit 2 on diff)
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocEntry {
  name: string;
  kind: 'interface' | 'type';
  description: string;
  example?: string;
  remarks?: string;
  since?: string;
  signature: string;
}

// ---------------------------------------------------------------------------
// JSDoc extraction
// ---------------------------------------------------------------------------

function extractTagText(comment: ts.JSDocComment | string | undefined): string {
  if (!comment) return '';
  if (typeof comment === 'string') return comment.trim();
  return (ts.getTextOfJSDocComment(comment) ?? '').trim();
}

export function extractJSDoc(node: ts.Node): { description: string; tags: Record<string, string> } {
  const nodeWithJsDoc = node as ts.Node & { jsDoc?: ts.JSDoc[] };
  const jsDocNodes = nodeWithJsDoc.jsDoc ?? [];
  let description = '';
  const tags: Record<string, string> = {};

  for (const jsdoc of jsDocNodes) {
    const text = extractTagText(jsdoc.comment);
    if (text) description = text;

    for (const tag of jsdoc.tags ?? []) {
      const tagName = tag.tagName.text;
      const tagText = extractTagText(tag.comment);
      // Accumulate repeated tags (e.g. multiple @example blocks) with a separator
      tags[tagName] = tags[tagName] ? tags[tagName] + '\n\n' + tagText : tagText;
    }
  }

  return { description, tags };
}

// ---------------------------------------------------------------------------
// Signature extraction
// ---------------------------------------------------------------------------

export function extractSignature(
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
): string {
  const printer = ts.createPrinter({ removeComments: true });
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

export const MAIN_INTERFACES = ['Command', 'Phase', 'FindingCategory', 'PolicyAction', 'AuditModule'];

const GETTING_STARTED = `## Getting Started

1. Install the Forja CLI: \`npm install -g @forja-hq/cli\`
2. Create a new plugin directory: \`mkdir my-forja-plugin && cd my-forja-plugin\`
3. Initialize a package: \`npm init -y && npm install typescript --save-dev\`
4. Add \`@forja-hq/cli\` as a peer dependency: \`npm install @forja-hq/cli --save-peer\`
5. Create \`src/index.ts\` and import the interface you want to implement (e.g. \`Command\`)
6. Implement the plugin stub (see the examples in each interface section below)
7. Build your plugin: \`npx tsc\`
8. Register the plugin in your \`forja.config.ts\`: \`plugins: ['./dist/index.js']\`
9. Run \`forja\` in your project to verify the plugin is loaded
10. Publish to npm: \`npm publish\``;

const VERSIONING = `## Stability & Versioning

This API follows [Semantic Versioning](https://semver.org/). See [SEMVER.md](SEMVER.md) for detailed stability guarantees, deprecation policy, and breaking change process.`;

export function buildMarkdown(entries: DocEntry[]): string {
  const lines: string[] = [];

  lines.push('# Forja Plugin API');
  lines.push('');
  lines.push('> Generated from `src/plugin/types.ts`. Do not edit manually — run `npm run plugin-api:gen` to update.');
  lines.push('');
  lines.push(GETTING_STARTED);
  lines.push('');
  lines.push(VERSIONING);
  lines.push('');
  lines.push('---');
  lines.push('');

  const sorted = [
    ...entries.filter((e) => MAIN_INTERFACES.includes(e.name)),
    ...entries.filter((e) => !MAIN_INTERFACES.includes(e.name)),
  ];

  for (const entry of sorted) {
    lines.push(`## \`${entry.name}\``);
    lines.push('');

    if (entry.since) {
      lines.push(`*Since: ${entry.since}*`);
      lines.push('');
    }

    lines.push('### Signature');
    lines.push('');
    lines.push('```typescript');
    lines.push(entry.signature);
    lines.push('```');
    lines.push('');

    if (entry.description) {
      lines.push('### Description');
      lines.push('');
      lines.push(entry.description);
      lines.push('');
    }

    if (entry.example) {
      lines.push('### Example');
      lines.push('');
      const exampleText = entry.example.trimStart().startsWith('```')
        ? entry.example
        : '```typescript\n' + entry.example + '\n```';
      lines.push(exampleText);
      lines.push('');
    }

    if (entry.remarks) {
      lines.push('### Remarks');
      lines.push('');
      lines.push(entry.remarks);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Core: parse source and collect entries
// ---------------------------------------------------------------------------

export function generatePluginApiDoc(sourcePath: string): string {
  const sourceText = fs.readFileSync(sourcePath, 'utf-8');
  const sourceFile = ts.createSourceFile(path.basename(sourcePath), sourceText, ts.ScriptTarget.Latest, true);

  const entries: DocEntry[] = [];

  function visit(node: ts.Node): void {
    const isExported = (n: ts.Node) =>
      ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && isExported(node)) {
      const { description, tags } = extractJSDoc(node);
      const signature = extractSignature(node, sourceFile);

      entries.push({
        name: node.name.text,
        kind: ts.isInterfaceDeclaration(node) ? 'interface' : 'type',
        description,
        example: tags['example'],
        remarks: tags['remarks'],
        since: tags['since'],
        signature,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return buildMarkdown(entries);
}

// ---------------------------------------------------------------------------
// Entry point — only runs when executed directly, not when imported
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const projectRoot = process.cwd();
  const sourcePath = path.join(projectRoot, 'src', 'plugin', 'types.ts');
  const outputPath = path.join(projectRoot, 'PLUGIN-API.md');
  const isCheck = process.argv.includes('--check');

  try {
    const doc = generatePluginApiDoc(sourcePath);

    if (isCheck) {
      if (!fs.existsSync(outputPath)) {
        process.stderr.write('PLUGIN-API.md does not exist. Run `npm run plugin-api:gen` to create it.\n');
        process.exit(2);
      }
      const existing = fs.readFileSync(outputPath, 'utf-8');
      if (doc !== existing) {
        process.stderr.write('PLUGIN-API.md is out of sync with src/plugin/types.ts.\nRun `npm run plugin-api:gen` to update it.\n');
        process.exit(2);
      }
      process.stdout.write('PLUGIN-API.md is up to date.\n');
    } else {
      fs.writeFileSync(outputPath, doc, 'utf-8');
      process.stdout.write(`PLUGIN-API.md generated (${doc.length} bytes).\n`);
    }
  } catch (err: unknown) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }
}
