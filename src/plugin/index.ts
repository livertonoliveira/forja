export type {
  Severity,
  Logger,
  Command,
  CommandContext,
  CommandResult,
  Phase,
  PhaseContext,
  PhaseResult,
  StoreAdapter,
  FindingCategory,
  PolicyAction,
  PolicyActionContext,
  AuditModule,
  AuditContext,
  AuditFinding,
  AuditReport,
  StackInfo,
} from './types.js';

export { PluginRegistry, PluginCollisionError } from './registry.js';
export type { RegisteredPlugin, PluginType } from './registry.js';

export { HookRunner } from './hooks.js';
export type { HookRunnerOptions, PluginWithHooks } from './hooks.js';
export type {
  PluginLifecycleHooks,
  RegisterContext,
  RunStartContext,
  RunResultContext,
  RunErrorContext,
} from './types.js';
