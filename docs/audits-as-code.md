# Audits as Code

The `AuditModule` interface lets you ship custom audit logic as a plain TypeScript object — no subclassing, no decorators, just a three-method contract that the Forja harness calls during `forja audit`.

This guide covers what the interface expects, walks you through writing your first audit from scratch, and provides a fully-annotated skeleton you can copy-paste as a starting point.

> Canonical JSON Schemas for audit output: [`schemas/audit/`](../schemas/audit/).
> SemVer guarantees: [`SEMVER.md`](../SEMVER.md).

---

## How the harness calls your module

The harness drives every `AuditModule` through three sequential steps:

1. **`detect(stack)`** — called synchronously for every registered module. Return `{ applicable: false }` to skip the module for the current project stack. This must be fast; do no I/O here.
2. **`run(ctx)`** — called only when `detect` returns `{ applicable: true }`. Scan the codebase and return an array of `AuditFinding` objects. Never throw; catch all errors and return an empty array with a log message instead.
3. **`report(findings)`** — called after `run` completes. Receives the full findings array and must return an `AuditReport` with both a human-readable `markdown` field and a machine-readable structured object conforming to `AuditReportSchema`.

---

## Build your first audit in 8 steps

### Step 1 — Install the package

```sh
npm install @forja-hq/cli
```

### Step 2 — Import the types

```typescript
import type { AuditModule, AuditFinding, AuditReport } from '@forja-hq/cli/plugin';
```

### Step 3 — Choose a namespaced module ID

Use a reverse-DNS style prefix to avoid collisions with built-in and third-party modules:

```typescript
const MODULE_ID = 'acme:no-console';
```

### Step 4 — Implement `detect`

Return `applicable: false` for stacks your module does not support. The `reason` field is logged by the harness when the module is skipped.

```typescript
detect(stack) {
  const ok = ['typescript', 'javascript'].includes(stack.language);
  return { applicable: ok, reason: ok ? undefined : 'JS/TS projects only' };
},
```

### Step 5 — Implement `run`

Receive a `ctx: AuditContext` which provides `cwd`, `logger`, `config`, and `abortSignal`. Glob for files, parse them, and build `AuditFinding` objects.

```typescript
async run(ctx) {
  const findings: AuditFinding[] = [];
  // ... scan ctx.cwd for console.log calls ...
  return findings;
},
```

### Step 6 — Build `AuditFinding` objects

Each finding must conform to `AuditFindingSchema`. The `schemaVersion` field must be the literal string `'1.0'`.

```typescript
findings.push({
  schemaVersion: '1.0',
  id: `${MODULE_ID}:${filePath}:${lineNumber}`,
  severity: 'low',
  title: 'console.log left in source',
  category: 'code-quality',
  description: `Found console.log at ${filePath}:${lineNumber}.`,
  filePath,
  line: lineNumber,
  remediation: 'Remove or replace with a structured logger.',
  confidence: 'high',
});
```

### Step 7 — Implement `report`

Produce both a markdown summary for humans and a structured payload for downstream tooling. Use `AuditReportSchema` to validate before returning.

```typescript
report(findings) {
  return {
    markdown: findings.length === 0
      ? '**no-console**: No console.log calls found.'
      : `**no-console**: ${findings.length} console.log call(s) found.\n\n` +
        findings.map(f => `- \`${f.filePath}:${f.line}\``).join('\n'),
    json: { moduleId: MODULE_ID, findings },
  };
},
```

### Step 8 — Register the module

Export your `AuditModule` and pass it to the harness plugin registration:

```typescript
export const noConsoleAudit: AuditModule = { id: MODULE_ID, detect, run, report };
```

---

## Full skeleton

The skeleton below is production-ready: it handles abort signals, logs errors instead of throwing, and stamps `schemaVersion: '1.0'` on every finding.

```typescript
import type { AuditModule, AuditFinding } from '@forja-hq/cli/plugin';
import { AuditFindingSchema, AuditReportSchema } from '@forja-hq/cli/audits';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MODULE_ID = 'acme:no-console';

export const noConsoleAudit: AuditModule = {
  id: MODULE_ID,

  // detect is synchronous and must be fast — do no I/O here.
  detect(stack) {
    const ok = ['typescript', 'javascript'].includes(stack.language);
    return { applicable: ok, reason: ok ? undefined : 'JS/TS projects only' };
  },

  // run receives an AuditContext and must never throw.
  async run(ctx) {
    const findings: AuditFinding[] = [];
    const startedAt = new Date().toISOString();

    try {
      const files = collectSourceFiles(ctx.cwd);

      for (const filePath of files) {
        // Respect cancellation between files.
        if (ctx.abortSignal.aborted) break;

        const lines = readFileSync(filePath, 'utf8').split('\n');

        lines.forEach((line, index) => {
          if (/console\.log/.test(line)) {
            // Validate each finding with Zod before pushing.
            const finding = AuditFindingSchema.parse({
              schemaVersion: '1.0',
              id: `${MODULE_ID}:${filePath}:${index + 1}`,
              severity: 'low',
              title: 'console.log left in source',
              category: 'code-quality',
              description: `console.log found at line ${index + 1}.`,
              filePath,
              line: index + 1,
              snippet: line.trim(),
              remediation: 'Replace with a structured logger (e.g. pino, winston).',
              confidence: 'high',
            });
            findings.push(finding);
          }
        });
      }
    } catch (err) {
      // Log but do not throw — return what we have so far.
      ctx.logger.error(`[${MODULE_ID}] unexpected error: ${String(err)}`);
    }

    return findings;
  },

  // report receives ALL findings and returns both human and machine output.
  report(findings) {
    const bySeverity: Record<string, number> = {};
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    }

    const markdown =
      findings.length === 0
        ? `**${MODULE_ID}**: No console.log calls found. ✓`
        : [
            `**${MODULE_ID}**: ${findings.length} console.log call(s) detected.`,
            '',
            '| File | Line | Snippet |',
            '|------|------|---------|',
            ...findings.map(
              (f) => `| \`${f.filePath}\` | ${f.line} | \`${f.snippet ?? ''}\` |`
            ),
          ].join('\n');

    // Validate the full report shape before returning.
    const report = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: MODULE_ID,
      stackInfo: { language: 'typescript', runtime: 'node' },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      findings,
      markdown,
      summary: { total: findings.length, bySeverity },
    });

    return {
      markdown: report.markdown,
      json: report,
    };
  },
};

// Helper — recursively collect .ts/.js files, ignoring node_modules.
function collectSourceFiles(cwd: string): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.[tj]s$/.test(entry.name)) results.push(full);
    }
  }
  walk(cwd);
  return results;
}
```

---

## JSON Schema validation

The Zod schemas at `src/audits/types.ts` are the single source of truth. The JSON Schema files under [`schemas/audit/`](../schemas/audit/) are derived artifacts — regenerate them with:

```sh
npm run schemas:gen
```

Both files (`audit-finding.json`, `audit-report.json`) follow **JSON Schema Draft 7** and can be used for validation in any language or toolchain that supports that specification.

See [`SEMVER.md`](../SEMVER.md) for the stability guarantee of `AuditFindingSchema` and `AuditReportSchema`.
