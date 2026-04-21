import { expectType } from 'tsd';
import type {
  Severity,
  Logger,
  FindingCategory,
  PolicyAction,
  PolicyActionContext,
  AuditModule,
  AuditContext,
  AuditFinding,
  AuditReport,
  StackInfo,
} from '../../src/plugin/index.js';

// Severity is a named alias used across interfaces
declare const sev: Severity;
expectType<'low' | 'medium' | 'high' | 'critical'>(sev);

// Logger is a shared interface usable by plugin authors
declare const log: Logger;
expectType<void>(log.info('msg'));

// FindingCategory accepts concrete implementation
const myCategory: FindingCategory = {
  id: 'custom:css-specificity',
  name: 'CSS Specificity',
  defaultSeverity: 'low',
};
expectType<FindingCategory>(myCategory);
expectType<Severity>(myCategory.defaultSeverity);

// PolicyAction accepts concrete implementation
const myAction: PolicyAction = {
  id: 'notify:pagerduty',
  params: { routingKey: 'abc123' },
  execute: async (ctx: PolicyActionContext): Promise<void> => {
    ctx.logger.info(`Run: ${JSON.stringify(ctx.run)}`);
  },
};
expectType<PolicyAction>(myAction);

// PolicyActionContext.env is Record<string, string> (no secrets)
declare const ctx: PolicyActionContext;
expectType<Record<string, string>>(ctx.env);
expectType<AuditFinding>(ctx.finding);
expectType<Logger>(ctx.logger);

// AuditModule accepts concrete implementation
const myModule: AuditModule = {
  id: 'audit:backend',
  detect: (stack: StackInfo) => ({ applicable: stack.language === 'TypeScript' }),
  run: async (_ctx: AuditContext): Promise<AuditFinding[]> => {
    return [
      {
        severity: 'high',
        title: 'Missing index',
        category: 'database',
        description: 'Table is missing an index on foreign key',
      },
    ];
  },
  report: (findings: AuditFinding[]): AuditReport => ({
    markdown: findings.map((f) => `- ${f.title}`).join('\n'),
    json: { findings },
  }),
};
expectType<AuditModule>(myModule);

// AuditModule.detect signature — return type is structurally correct
declare const mod: AuditModule;
declare const stack: StackInfo;
expectType<{ applicable: boolean; reason?: string }>(mod.detect(stack));

// AuditFinding severity uses the shared Severity alias
declare const finding: AuditFinding;
expectType<Severity>(finding.severity);

// AuditReport shape
declare const report: AuditReport;
expectType<string>(report.markdown);
expectType<Record<string, unknown>>(report.json);

// AuditContext fields
declare const auditCtx: AuditContext;
expectType<string>(auditCtx.cwd);
expectType<StackInfo>(auditCtx.stack);
expectType<AbortSignal>(auditCtx.abortSignal);

// StackInfo fields
expectType<string>(stack.language);
expectType<string>(stack.runtime);
