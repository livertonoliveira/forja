import { loadConfig, redactDsn } from '../config/loader.js';
import { createStore } from './index.js';
import type { ForjaStore } from './interface.js';
import { getPendingMigrationCount, runMigrations } from './drizzle/migrations.js';

const LOCAL_URL_PATTERN = /localhost|127\.0\.0\.1/;

export async function createStoreFromConfig(): Promise<ForjaStore> {
  const config = await loadConfig();
  const store = createStore(config.storeUrl);

  try {
    await store.ping();
  } catch {
    console.error(`[forja] Could not connect to Postgres at ${redactDsn(config.storeUrl)}`);
    console.error(`  → Run \`forja infra up\` to start a local database`);
    console.error(`  → Or set FORJA_STORE_URL to your connection string`);
    process.exit(1);
  }

  try {
    const pending = await getPendingMigrationCount(config.storeUrl);
    if (pending > 0) {
      const isLocal = LOCAL_URL_PATTERN.test(config.storeUrl);
      if (isLocal) {
        await runMigrations(config.storeUrl);
        console.error(`[forja] Auto-applied ${pending} pending migration(s).`);
      } else {
        console.error(`[forja] ⚠ ${pending} pending migration(s) detected. Run \`forja infra migrate\` to apply.`);
      }
    }
  } catch {
    // Non-fatal: migration check failure should not block operation
  }

  return store;
}
