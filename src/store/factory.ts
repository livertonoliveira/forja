import { loadConfig, redactDsn } from '../config/loader.js';
import { createStore } from './index.js';
import type { ForjaStore } from './interface.js';

export async function createStoreFromConfig(): Promise<ForjaStore> {
  const config = await loadConfig();
  const store = createStore(config.storeUrl);

  try {
    await store.ping();
  } catch {
    console.error(`[forja] Não foi possível conectar ao Postgres em ${redactDsn(config.storeUrl)}`);
    console.error(`  → Execute \`forja infra up\` para iniciar um banco de dados local`);
    console.error(`  → Ou defina FORJA_STORE_URL para sua connection string`);
    process.exit(1);
  }

  return store;
}
