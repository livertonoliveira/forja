import type { PolicyAction } from './parser.js';

export interface ActionContext {
  runId: string;
}

export async function executeActions(actions: PolicyAction[], _context: ActionContext): Promise<void> {
  await Promise.all(actions.map(async (action) => {
    if (action.action === 'log') {
      const message = (action.message ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]|[\r\n]/g, '');
      console.log(`[forja] policy: ${message}`);
    }
    // http_post and notify_slack: evaluator.ts already warns; no-op here to avoid duplicate warnings
    // fail_gate, warn_gate, pass_gate are decision actions — not side effects
  }));
}
