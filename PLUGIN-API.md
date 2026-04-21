# Forja Plugin API

> Generated from `src/plugin/types.ts`. Do not edit manually — run `npm run plugin-api:gen` to update.

## Getting Started

1. Install the Forja CLI: `npm install -g @forja-hq/cli`
2. Create a new plugin directory: `mkdir my-forja-plugin && cd my-forja-plugin`
3. Initialize a package: `npm init -y && npm install typescript --save-dev`
4. Add `@forja-hq/cli` as a peer dependency: `npm install @forja-hq/cli --save-peer`
5. Create `src/index.ts` and import the interface you want to implement (e.g. `Command`)
6. Implement the plugin stub (see the examples in each interface section below)
7. Build your plugin: `npx tsc`
8. Register the plugin in your `forja.config.ts`: `plugins: ['./dist/index.js']`
9. Run `forja` in your project to verify the plugin is loaded
10. Publish to npm: `npm publish`

## Stability & Versioning

This API follows [Semantic Versioning](https://semver.org/). See [SEMVER.md](SEMVER.md) for detailed stability guarantees, deprecation policy, and breaking change process.

---

## `Command`

*Since: v1.0.0*

### Signature

```typescript
export interface Command {
    id: string;
    description: string;
    labels?: string[];
    run(ctx: CommandContext): Promise<CommandResult>;
}
```

### Description

A plugin-provided CLI command registered in the Forja CLI.

Implement this interface to add custom subcommands that users can invoke via
`forja <id>`. The command receives full context (cwd, config, store, logger)
and must return an exit code.

### Example

```ts
import type { Command } from '@forja-hq/cli/plugin';

export const greetCommand: Command = {
  id: 'my-plugin:greet',
  description: 'Prints a greeting to the log',
  labels: ['demo'],
  async run(ctx) {
    ctx.logger.info('Hello from my-plugin!');
    return { exitCode: 0, summary: 'Greeted successfully' };
  },
};
```

### Remarks

- `id` must be globally unique across all registered plugins. Use a namespaced
  prefix (e.g. `my-plugin:greet`) to avoid collisions with other plugins.
- `run` must never throw — catch all errors internally and return a non-zero
  `exitCode` with a descriptive `summary` instead.
- `labels` are used for filtering commands in the CLI help output.

---

## `Phase`

*Since: v1.0.0*

### Signature

```typescript
export interface Phase {
    id: string;
    insertAfter?: string;
    timeoutMs?: number;
    run(ctx: PhaseContext): Promise<PhaseResult>;
}
```

### Description

A custom pipeline phase injected into the Forja development pipeline.

Phases run sequentially in insertion order. Use `insertAfter` to position
your phase relative to a built-in phase (e.g. `'test'`, `'perf'`). The
harness honours `timeoutMs` and signals cancellation via `abortSignal`.

### Example

```ts
import type { Phase } from '@forja-hq/cli/plugin';

export const licenseCheckPhase: Phase = {
  id: 'my-plugin:license-check',
  insertAfter: 'test',
  timeoutMs: 30_000,
  async run(ctx) {
    if (ctx.abortSignal.aborted) return { status: 'fail' };
    // ... check licenses ...
    return { status: 'pass', outputs: { checkedAt: Date.now() } };
  },
};
```

### Remarks

- Check `ctx.abortSignal.aborted` at the start of long operations and
  return early with `{ status: 'fail' }` to respect cancellation.
- If `insertAfter` references an unknown phase ID, the phase is appended
  at the end of the pipeline rather than throwing.
- Returning `'fail'` stops the pipeline unless the user overrides the gate.

---

## `FindingCategory`

*Since: v1.0.0*

### Signature

```typescript
export interface FindingCategory {
    id: string;
    name: string;
    defaultSeverity: Severity;
}
```

### Description

A classifier that groups audit findings under a named, severity-defaulted category.

Register `FindingCategory` instances so that `AuditModule` findings can be
tagged with a consistent taxonomy. The harness aggregates and filters
findings by category when generating reports.

### Example

```ts
import type { FindingCategory } from '@forja-hq/cli/plugin';

export const dependencyCategory: FindingCategory = {
  id: 'my-plugin:dependency',
  name: 'Dependency Risk',
  defaultSeverity: 'medium',
};
```

### Remarks

- `defaultSeverity` is used when an `AuditFinding` does not override it.
  Individual findings can always report a higher or lower severity.
- `id` must be unique across all registered plugins. Namespace it with your
  plugin prefix (e.g. `my-plugin:dependency`).

---

## `PolicyAction`

*Since: v1.0.0*

### Signature

```typescript
export interface PolicyAction {
    id: string;
    params?: Record<string, unknown>;
    execute(ctx: PolicyActionContext): Promise<void>;
}
```

### Description

A policy-driven remediation action triggered by audit findings.

Implement this interface to define automated responses to findings — for
example, creating a Linear issue, sending a Slack notification, or blocking
a deployment when a `critical` finding is detected.

### Example

```ts
import type { PolicyAction } from '@forja-hq/cli/plugin';

export const slackNotifyAction: PolicyAction = {
  id: 'my-plugin:slack-notify',
  params: { channel: '#security-alerts' },
  async execute(ctx) {
    ctx.logger.info(`Notifying ${String(ctx.finding.severity)} finding: ${ctx.finding.title}`);
    // ... send Slack message ...
  },
};
```

### Remarks

- `execute` must never throw. Catch all errors internally; the harness does
  not retry or recover from action failures.
- `params` are static configuration values merged from `forja.config.ts`.
  Dynamic data (the finding, run metadata) arrives via `ctx`.

---

## `AuditModule`

*Since: v1.0.0*

### Signature

```typescript
export interface AuditModule {
    id: string;
    detect(stack: StackInfo): {
        applicable: boolean;
        reason?: string;
    };
    run(ctx: AuditContext): Promise<AuditFinding[]>;
    report(findings: AuditFinding[]): AuditReport;
}
```

### Description

A project-wide audit module that detects issues in the codebase.

Implement this interface to add custom audit checks to `forja audit`. The
harness calls `detect` to determine applicability, then `run` to collect
findings, then `report` to format them. All three methods must be pure with
respect to the file system — write no files, only read and return data.

### Example

```ts
import type { AuditModule } from '@forja-hq/cli/plugin';

export const envLeakAudit: AuditModule = {
  id: 'my-plugin:env-leak',
  detect(stack) {
    return { applicable: stack.language === 'typescript', reason: 'TS projects only' };
  },
  async run(ctx) {
    // ... scan files for leaked env vars ...
    return [];
  },
  report(findings) {
    return {
      markdown: findings.length === 0 ? 'No env leaks detected.' : `${findings.length} leak(s) found.`,
      json: { findings },
    };
  },
};
```

### Remarks

- `onError` (if the harness catches an unhandled rejection from `run`) is
  logged but does not propagate — the module is marked as errored and the
  audit continues. Therefore, `run` itself should never throw; return an
  empty array and log via `ctx` instead.
- `detect` is synchronous and must be fast — it is called before any I/O.
  Return `{ applicable: false }` for stacks your module does not support.
- `report` receives ALL findings from `run` and is responsible for both the
  human-readable markdown and the machine-readable JSON representation.

---

## `Severity`

*Since: v1.0.0*

### Signature

```typescript
export type Severity = 'low' | 'medium' | 'high' | 'critical';
```

### Description

Severity level for audit findings.

Use `critical` for security vulnerabilities or data-loss risks, `high` for
severe correctness issues, `medium` for quality/performance concerns, and
`low` for style or informational findings.

---

## `Logger`

*Since: v1.0.0*

### Signature

```typescript
export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
```

### Description

Structured logger injected into plugin contexts.

All output goes through this interface so the harness can capture, format,
and route logs to the appropriate sinks (stdout, Linear comment, UI).

### Remarks

Never use `console.log` directly inside a plugin — use the provided `logger`
so output respects the harness's verbosity and formatting settings.

---

## `StoreAdapter`

*Since: v1.0.0*

### Signature

```typescript
export interface StoreAdapter {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
}
```

### Description

Key-value store shared across plugin executions within the same run.

Use this to persist state between commands or phases without relying on the
file system. Values are serialized as JSON; keep them small and serializable.

---

## `CommandContext`

*Since: v1.0.0*

### Signature

```typescript
export interface CommandContext {
    cwd: string;
    config: Record<string, unknown>;
    store: StoreAdapter;
    logger: Logger;
}
```

### Description

Execution context passed to every `Command.run` call.

---

## `CommandResult`

*Since: v1.0.0*

### Signature

```typescript
export interface CommandResult {
    exitCode: number;
    summary?: string;
}
```

### Description

Return value of `Command.run`.

---

## `PhaseContext`

*Since: v1.0.0*

### Signature

```typescript
export interface PhaseContext {
    runId: string;
    previousPhases: ReadonlyArray<{
        id: string;
        status: 'pass' | 'warn' | 'fail';
    }>;
    store: StoreAdapter;
    abortSignal: AbortSignal;
}
```

### Description

Execution context passed to every `Phase.run` call.

---

## `PhaseResult`

*Since: v1.0.0*

### Signature

```typescript
export interface PhaseResult {
    status: 'pass' | 'warn' | 'fail';
    outputs?: Record<string, unknown>;
}
```

### Description

Return value of `Phase.run`.

---

## `PolicyActionContext`

*Since: v1.0.0*

### Signature

```typescript
export interface PolicyActionContext {
    run: Record<string, unknown>;
    finding: AuditFinding;
    logger: Logger;
    env: Record<string, string>;
}
```

### Description

Execution context passed to every `PolicyAction.execute` call.

---

## `StackInfo`

*Since: v1.0.0*

### Signature

```typescript
export interface StackInfo {
    language: string;
    runtime: string;
    framework?: string;
}
```

### Description

Information about the technology stack of the project being audited.

---

## `AuditContext`

*Since: v1.0.0*

### Signature

```typescript
export interface AuditContext {
    cwd: string;
    stack: StackInfo;
    config: Record<string, unknown>;
    abortSignal: AbortSignal;
}
```

### Description

Execution context passed to `AuditModule.run`.

---

## `AuditFinding`

*Since: v1.0.0*

### Signature

```typescript
export interface AuditFinding {
    severity: Severity;
    title: string;
    filePath?: string;
    line?: number;
    category: string;
    description: string;
}
```

### Description

A single finding produced by an `AuditModule`.

---

## `AuditReport`

*Since: v1.0.0*

### Signature

```typescript
export interface AuditReport {
    markdown: string;
    json: Record<string, unknown>;
}
```

### Description

Report generated by `AuditModule.report`.

---

## CLI Reference

### `forja plugins list`

Lists all registered plugins discovered from `forja/plugins/` (local) and `node_modules/forja-plugin-*` (npm).

**Usage**

```bash
forja plugins list [options]
```

**Options**

| Flag | Description |
|------|-------------|
| `--json` | Output the plugin list as JSON (excludes the internal `module` field) |
| `--invalid` | Show plugins that failed validation during bootstrap |

**Columns**

| Column | Description |
|--------|-------------|
| `ID` | The plugin identifier declared in the module |
| `Type` | Detected interface type(s): `Command`, `Phase`, `FindingCategory`, `PolicyAction`, `AuditModule`, or `unknown` |
| `Version` | Resolved version string (from `package.json` or `0.0.0` for local plugins without one) |
| `Source` | Discovery source: `local` or `npm` |
| `Path` | Absolute path to the loaded plugin file |

**Example output — table**

```
ID                   Type     Version  Source  Path
--------------------  -------  -------  ------  ----------------------------------------
my-plugin:greet       Command  1.2.0    npm     /project/node_modules/forja-plugin-greet/dist/index.js
my-plugin:license     Phase    0.1.0    local   /project/forja/plugins/license-check.js
```

**Example output — JSON**

```bash
forja plugins list --json
```

```json
[
  {
    "id": "my-plugin:greet",
    "source": "npm",
    "path": "/project/node_modules/forja-plugin-greet/dist/index.js",
    "version": "1.2.0"
  }
]
```

**Notes**

- A single plugin file can export multiple exports that match different interface types. When this happens, all matched types are shown comma-separated in the `Type` column.
- The `--invalid` flag currently reports that no invalid plugin tracking is available at runtime; check stderr output during bootstrap for loader warnings.
- If no plugins are discovered, the command prints `No plugins registered.` and exits with code 0.
