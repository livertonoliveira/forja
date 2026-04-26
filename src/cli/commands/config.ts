import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { loadConfig, setConfigValue, redactDsn } from '../../config/loader.js';

export const configCommand = new Command('config')
  .description('Manage Forja configuration')
  .argument('<action>', 'action to perform: get, set, or migrate')
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
    } else if (action === 'migrate') {
      const configPath = path.resolve(process.cwd(), 'forja/config.md');
      let content: string;
      try {
        content = await fs.readFile(configPath, 'utf-8');
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error('[forja] forja/config.md not found — run `forja init` first');
          process.exit(1);
        }
        throw err;
      }
      const pattern = /artifact[_ ]language\s*:/i;
      const added: string[] = [];
      if (!pattern.test(content)) {
        if (content.includes('## Conventions\n')) {
          content = content.replace('## Conventions\n', '## Conventions\n- artifact_language: en\n');
        } else {
          content += '\n## Conventions\n- artifact_language: en\n';
        }
        added.push('artifact_language: en');
      }
      if (added.length === 0) {
        console.log('[forja] Nothing to migrate — all fields already present');
      } else {
        await fs.writeFile(configPath, content, 'utf-8');
        console.log('[forja] Fields added:');
        for (const field of added) {
          console.log(`  + ${field}`);
        }
      }
    } else {
      console.error(`[forja] Unknown action: ${action}. Use: get, set, or migrate`);
      process.exit(1);
    }
  });
