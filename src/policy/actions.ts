import type { PolicyAction } from './parser.js';
import { notifySlack } from './actions/notify-slack.js';
import { httpPost } from './actions/http-post.js';

export interface ActionContext {
  runId: string;
}

export async function executeActions(actions: PolicyAction[], context: ActionContext): Promise<void> {
  const notifiedChannels = new Set<string>();
  await Promise.all(actions.map(async (action) => {
    if (action.action === 'log') {
      // eslint-disable-next-line no-control-regex
      const message = (action.message ?? '').replace(/\x1b\[[0-9;]*[A-Za-z]|[\r\n]/g, '');
      console.log(`[forja] policy: ${message}`);
    } else if (action.action === 'notify_slack') {
      const channel = action.channel ?? '#eng-alerts';
      if (notifiedChannels.has(channel)) return;
      notifiedChannels.add(channel);
      await notifySlack({ channel, message: action.message ?? '', context });
    } else if (action.action === 'http_post') {
      if (!action.url) {
        console.warn('[forja] http_post action missing required "url" field — skipped');
        return;
      }
      await httpPost({
        url: action.url,
        payload: action.payload as Record<string, unknown> | undefined,
        headers: action.headers,
        context,
      });
    }
    // fail_gate, warn_gate, pass_gate are decision actions — not side effects
  }));
}
