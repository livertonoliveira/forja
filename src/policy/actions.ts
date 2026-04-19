import type { PolicyAction } from './parser.js';
import { notifySlack } from './actions/notify-slack.js';

export interface ActionContext {
  runId: string;
}

export async function executeActions(actions: PolicyAction[], context: ActionContext): Promise<void> {
  const notifiedChannels = new Set<string>();
  await Promise.all(actions.map(async (action) => {
    if (action.action === 'log') {
      const message = (action.message ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]|[\r\n]/g, '');
      console.log(`[forja] policy: ${message}`);
    } else if (action.action === 'notify_slack') {
      const channel = action.channel ?? '#eng-alerts';
      if (notifiedChannels.has(channel)) return;
      notifiedChannels.add(channel);
      await notifySlack({ channel, message: action.message ?? '', context });
    }
    // http_post: evaluator.ts already warns; no-op here to avoid duplicate warnings
    // fail_gate, warn_gate, pass_gate are decision actions — not side effects
  }));
}
