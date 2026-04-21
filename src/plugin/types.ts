export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface StoreAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface CommandContext {
  cwd: string;
  config: Record<string, unknown>;
  store: StoreAdapter;
  logger: Logger;
}

export interface CommandResult {
  exitCode: number;
  summary?: string;
}

export interface Command {
  id: string;
  description: string;
  labels?: string[];
  run(ctx: CommandContext): Promise<CommandResult>;
}

export interface PhaseContext {
  runId: string;
  previousPhases: ReadonlyArray<{ id: string; status: 'pass' | 'warn' | 'fail' }>;
  store: StoreAdapter;
  abortSignal: AbortSignal;
}

export interface PhaseResult {
  status: 'pass' | 'warn' | 'fail';
  outputs?: Record<string, unknown>;
}

export interface Phase {
  id: string;
  insertAfter?: string;
  timeoutMs?: number;
  run(ctx: PhaseContext): Promise<PhaseResult>;
}

export interface FindingCategory {
  id: string;
  name: string;
  defaultSeverity: Severity;
}

export interface PolicyActionContext {
  run: Record<string, unknown>;
  finding: AuditFinding;
  logger: Logger;
  env: Record<string, string>;
}

export interface PolicyAction {
  id: string;
  params?: Record<string, unknown>;
  execute(ctx: PolicyActionContext): Promise<void>;
}

export interface StackInfo {
  language: string;
  runtime: string;
  framework?: string;
}

export interface AuditContext {
  cwd: string;
  stack: StackInfo;
  config: Record<string, unknown>;
  abortSignal: AbortSignal;
}

export interface AuditFinding {
  severity: Severity;
  title: string;
  filePath?: string;
  line?: number;
  category: string;
  description: string;
}

export interface AuditReport {
  markdown: string;
  json: Record<string, unknown>;
}

export interface AuditModule {
  id: string;
  detect(stack: StackInfo): { applicable: boolean; reason?: string };
  run(ctx: AuditContext): Promise<AuditFinding[]>;
  report(findings: AuditFinding[]): AuditReport;
}
