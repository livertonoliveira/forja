import { Command } from 'commander';
import { loadConfig, setConfigValue, redactDsn } from '../../config/loader.js';

export const configCommand = new Command('config')
  .description('Manage Forja configuration')
  .argument('<action>', 'action to perform: get or set')
  .argument('[key]', 'configuration key')
  .argument('[value]', 'configuration value')
  .action(async (action: string, key?: string, value?: string) => {
    if (action === 'get') {
      if (!key) {
        console.error('[forja] config get requires a key');
        process.exit(1);
      }
      if (key === 'store_url') {
        const config = await loadConfig();
        console.log(`store_url = ${redactDsn(config.storeUrl)}`);
        console.log(`source    = ${config.source}`);
      } else if (key === 'slack_webhook_url') {
        const config = await loadConfig();
        console.log(`slack_webhook_url = ${config.slackWebhookUrl ?? '(not set)'}`);
      } else if (key === 'github_token') {
        const config = await loadConfig();
        const token = config.githubToken;
        console.log(`github_token = ${token ? '[set]' : '(not set)'}`);
        console.log(`source       = ${config.source}`);
      } else {
        console.error(`[forja] Unknown config key: ${key}`);
        process.exit(1);
      }
    } else if (action === 'set') {
      if (!key || !value) {
        console.error('[forja] config set requires a key and value');
        process.exit(1);
      }
      await setConfigValue(key, value);
      console.log(`[forja] ${key} saved to ~/.forja/config.json`);
      if (key === 'github_token') {
        console.log('[forja] Tip: avoid passing tokens as CLI arguments — consider using the GITHUB_TOKEN env var instead');
      }
    } else {
      console.error(`[forja] Unknown action: ${action}. Use: get or set`);
      process.exit(1);
    }
  });
