/**
 * Severity level for audit findings.
 *
 * Use `critical` for security vulnerabilities or data-loss risks, `high` for
 * severe correctness issues, `medium` for quality/performance concerns, and
 * `low` for style or informational findings.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Structured logger injected into plugin contexts.
 *
 * All output goes through this interface so the harness can capture, format,
 * and route logs to the appropriate sinks (stdout, Linear comment, UI).
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 *
 * @remarks
 * Never use `console.log` directly inside a plugin — use the provided `logger`
 * so output respects the harness's verbosity and formatting settings.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Key-value store shared across plugin executions within the same run.
 *
 * Use this to persist state between commands or phases without relying on the
 * file system. Values are serialized as JSON; keep them small and serializable.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface StoreAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/**
 * Execution context passed to every `Command.run` call.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface CommandContext {
  /** Absolute path to the current working directory of the project being run. */
  cwd: string;
  /** Plugin-specific configuration sourced from `forja.config.ts`. */
  config: Record<string, unknown>;
  /** Run-scoped key-value store for sharing state between commands. */
  store: StoreAdapter;
  /** Structured logger — prefer this over `console.log`. */
  logger: Logger;
}

/**
 * Return value of `Command.run`.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface CommandResult {
  /** Unix-style exit code. Use `0` for success, non-zero for failure. */
  exitCode: number;
  /** Optional short summary surfaced in the harness UI and Linear comments. */
  summary?: string;
}

/**
 * A plugin-provided CLI command registered in the Forja CLI.
 *
 * Implement this interface to add custom subcommands that users can invoke via
 * `forja <id>`. The command receives full context (cwd, config, store, logger)
 * and must return an exit code.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 *
 * @example
 * ```ts
 * import type { Command } from '@forja-hq/cli/plugin';
 *
 * export const greetCommand: Command = {
 *   id: 'my-plugin:greet',
 *   description: 'Prints a greeting to the log',
 *   labels: ['demo'],
 *   async run(ctx) {
 *     ctx.logger.info('Hello from my-plugin!');
 *     return { exitCode: 0, summary: 'Greeted successfully' };
 *   },
 * };
 * ```
 *
 * @remarks
 * - `id` must be globally unique across all registered plugins. Use a namespaced
 *   prefix (e.g. `my-plugin:greet`) to avoid collisions with other plugins.
 * - `run` must never throw — catch all errors internally and return a non-zero
 *   `exitCode` with a descriptive `summary` instead.
 * - `labels` are used for filtering commands in the CLI help output.
 */
export interface Command {
  /** Unique command identifier used as the CLI subcommand name. */
  id: string;
  /** Human-readable description shown in `forja --help`. */
  description: string;
  /** Optional tags for filtering commands by category. */
  labels?: string[];
  run(ctx: CommandContext): Promise<CommandResult>;
}

/**
 * Execution context passed to every `Phase.run` call.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface PhaseContext {
  /** Unique identifier for the current pipeline run. */
  runId: string;
  /** Ordered list of phases that have already completed in this run. */
  previousPhases: ReadonlyArray<{ id: string; status: 'pass' | 'warn' | 'fail' }>;
  /** Run-scoped key-value store for sharing data between phases. */
  store: StoreAdapter;
  /** Signal that fires when the run is cancelled or times out. */
  abortSignal: AbortSignal;
}

/**
 * Return value of `Phase.run`.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface PhaseResult {
  /** Overall outcome of the phase. A `fail` status gates the pipeline. */
  status: 'pass' | 'warn' | 'fail';
  /** Arbitrary data made available to downstream phases via `PhaseContext.previousPhases`. */
  outputs?: Record<string, unknown>;
}

/**
 * A custom pipeline phase injected into the Forja development pipeline.
 *
 * Phases run sequentially in insertion order. Use `insertAfter` to position
 * your phase relative to a built-in phase (e.g. `'test'`, `'perf'`). The
 * harness honours `timeoutMs` and signals cancellation via `abortSignal`.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 *
 * @example
 * ```ts
 * import type { Phase } from '@forja-hq/cli/plugin';
 *
 * export const licenseCheckPhase: Phase = {
 *   id: 'my-plugin:license-check',
 *   insertAfter: 'test',
 *   timeoutMs: 30_000,
 *   async run(ctx) {
 *     if (ctx.abortSignal.aborted) return { status: 'fail' };
 *     // ... check licenses ...
 *     return { status: 'pass', outputs: { checkedAt: Date.now() } };
 *   },
 * };
 * ```
 *
 * @remarks
 * - Check `ctx.abortSignal.aborted` at the start of long operations and
 *   return early with `{ status: 'fail' }` to respect cancellation.
 * - If `insertAfter` references an unknown phase ID, the phase is appended
 *   at the end of the pipeline rather than throwing.
 * - Returning `'fail'` stops the pipeline unless the user overrides the gate.
 */
export interface Phase {
  /** Unique phase identifier. Use a namespaced prefix to avoid collisions. */
  id: string;
  /** ID of the built-in or plugin phase after which this phase will run. */
  insertAfter?: string;
  /** Maximum duration in milliseconds before the harness cancels the phase. */
  timeoutMs?: number;
  run(ctx: PhaseContext): Promise<PhaseResult>;
}

/**
 * A classifier that groups audit findings under a named, severity-defaulted category.
 *
 * Register `FindingCategory` instances so that `AuditModule` findings can be
 * tagged with a consistent taxonomy. The harness aggregates and filters
 * findings by category when generating reports.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 *
 * @example
 * ```ts
 * import type { FindingCategory } from '@forja-hq/cli/plugin';
 *
 * export const dependencyCategory: FindingCategory = {
 *   id: 'my-plugin:dependency',
 *   name: 'Dependency Risk',
 *   defaultSeverity: 'medium',
 * };
 * ```
 *
 * @remarks
 * - `defaultSeverity` is used when an `AuditFinding` does not override it.
 *   Individual findings can always report a higher or lower severity.
 * - `id` must be unique across all registered plugins. Namespace it with your
 *   plugin prefix (e.g. `my-plugin:dependency`).
 */
export interface FindingCategory {
  /** Unique category identifier used in `AuditFinding.category`. */
  id: string;
  /** Human-readable category label shown in audit reports. */
  name: string;
  /** Default severity applied to findings that belong to this category. */
  defaultSeverity: Severity;
}

/**
 * Execution context passed to every `PolicyAction.execute` call.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface PolicyActionContext {
  /** Metadata about the current pipeline run. */
  run: Record<string, unknown>;
  /** The specific audit finding that triggered this policy action. */
  finding: AuditFinding;
  /** Structured logger — prefer this over `console.log`. */
  logger: Logger;
  /** Snapshot of `process.env` at the time the action was triggered. */
  env: Record<string, string>;
}

/**
 * A policy-driven remediation action triggered by audit findings.
 *
 * Implement this interface to define automated responses to findings — for
 * example, creating a Linear issue, sending a Slack notification, or blocking
 * a deployment when a `critical` finding is detected.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 *
 * @example
 * ```ts
 * import type { PolicyAction } from '@forja-hq/cli/plugin';
 *
 * export const slackNotifyAction: PolicyAction = {
 *   id: 'my-plugin:slack-notify',
 *   params: { channel: '#security-alerts' },
 *   async execute(ctx) {
 *     ctx.logger.info(`Notifying ${String(ctx.finding.severity)} finding: ${ctx.finding.title}`);
 *     // ... send Slack message ...
 *   },
 * };
 * ```
 *
 * @remarks
 * - `execute` must never throw. Catch all errors internally; the harness does
 *   not retry or recover from action failures.
 * - `params` are static configuration values merged from `forja.config.ts`.
 *   Dynamic data (the finding, run metadata) arrives via `ctx`.
 */
export interface PolicyAction {
  /** Unique action identifier. Use a namespaced prefix to avoid collisions. */
  id: string;
  /** Static configuration parameters sourced from `forja.config.ts`. */
  params?: Record<string, unknown>;
  execute(ctx: PolicyActionContext): Promise<void>;
}

/**
 * Information about the technology stack of the project being audited.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface StackInfo {
  /** Primary programming language detected in the project (e.g. `'typescript'`). */
  language: string;
  /** Runtime environment (e.g. `'node'`, `'deno'`, `'bun'`). */
  runtime: string;
  /** Optional framework detected (e.g. `'nextjs'`, `'express'`). */
  framework?: string;
}

/**
 * Execution context passed to `AuditModule.run`.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface AuditContext {
  /** Absolute path to the root of the project being audited. */
  cwd: string;
  /** Detected stack information for the project. */
  stack: StackInfo;
  /** Module-specific configuration sourced from `forja.config.ts`. */
  config: Record<string, unknown>;
  /** Signal that fires when the audit run is cancelled or times out. */
  abortSignal: AbortSignal;
}

/**
 * A single finding produced by an `AuditModule`.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface AuditFinding {
  /** Severity of this specific finding. */
  severity: Severity;
  /** Short, human-readable title for the finding. */
  title: string;
  /** Path to the file where the finding was detected, relative to `cwd`. */
  filePath?: string;
  /** Line number within `filePath` where the finding was detected. */
  line?: number;
  /** Category ID matching a registered `FindingCategory.id`. */
  category: string;
  /** Detailed description of the finding, including remediation guidance. */
  description: string;
}

/**
 * Report generated by `AuditModule.report`.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 */
export interface AuditReport {
  /** Markdown-formatted report suitable for rendering in Linear or the CLI. */
  markdown: string;
  /** Machine-readable representation of the report for downstream processing. */
  json: Record<string, unknown>;
}

/**
 * A project-wide audit module that detects issues in the codebase.
 *
 * Implement this interface to add custom audit checks to `forja audit`. The
 * harness calls `detect` to determine applicability, then `run` to collect
 * findings, then `report` to format them. All three methods must be pure with
 * respect to the file system — write no files, only read and return data.
 *
 * @since v1.0.0
 * @see PLUGIN-API.md
 *
 * @example
 * ```ts
 * import type { AuditModule } from '@forja-hq/cli/plugin';
 *
 * export const envLeakAudit: AuditModule = {
 *   id: 'my-plugin:env-leak',
 *   detect(stack) {
 *     return { applicable: stack.language === 'typescript', reason: 'TS projects only' };
 *   },
 *   async run(ctx) {
 *     // ... scan files for leaked env vars ...
 *     return [];
 *   },
 *   report(findings) {
 *     return {
 *       markdown: findings.length === 0 ? 'No env leaks detected.' : `${findings.length} leak(s) found.`,
 *       json: { findings },
 *     };
 *   },
 * };
 * ```
 *
 * @remarks
 * - `onError` (if the harness catches an unhandled rejection from `run`) is
 *   logged but does not propagate — the module is marked as errored and the
 *   audit continues. Therefore, `run` itself should never throw; return an
 *   empty array and log via `ctx` instead.
 * - `detect` is synchronous and must be fast — it is called before any I/O.
 *   Return `{ applicable: false }` for stacks your module does not support.
 * - `report` receives ALL findings from `run` and is responsible for both the
 *   human-readable markdown and the machine-readable JSON representation.
 */
export interface AuditModule {
  /** Unique module identifier. Use a namespaced prefix to avoid collisions. */
  id: string;
  detect(stack: StackInfo): { applicable: boolean; reason?: string };
  run(ctx: AuditContext): Promise<AuditFinding[]>;
  report(findings: AuditFinding[]): AuditReport;
}
