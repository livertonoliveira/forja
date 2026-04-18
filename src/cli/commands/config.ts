import { Command } from 'commander';
import { loadConfig, setConfigValue } from '../../config/loader.js';

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
        console.log(`store_url = ${config.storeUrl}`);
        console.log(`source    = ${config.source}`);
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
    } else {
      console.error(`[forja] Unknown action: ${action}. Use: get or set`);
      process.exit(1);
    }
  });
