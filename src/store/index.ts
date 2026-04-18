export * from './interface.js';
export * from './drizzle/schema.js';
export { DrizzlePostgresStore } from './drizzle/adapter.js';

import type { ForjaStore } from './interface.js';
import { DrizzlePostgresStore } from './drizzle/adapter.js';

export function createStore(connectionString: string): ForjaStore {
  return new DrizzlePostgresStore(connectionString);
}
