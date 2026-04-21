export interface StoreAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface CommandContext {
  cwd: string;
  config: Record<string, unknown>;
  store: StoreAdapter;
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
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
