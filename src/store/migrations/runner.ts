import type { Migration, MigrationContext } from './primitives.js';
import type { Logger } from '../../plugin/types.js';

export interface RunnerOptions {
  dryRun?: boolean;
  from?: string;
  to?: string;
  logger?: Logger;
}

export abstract class MigrationRunner<T> {
  constructor(
    protected readonly migrations: Migration[],
    protected readonly kind: string,
  ) {}

  plan(currentVersion: string, targetVersion: string): Migration[] {
    if (currentVersion === targetVersion) return [];

    const byFrom = new Map<string, Migration[]>();
    for (const migration of this.migrations) {
      const existing = byFrom.get(migration.from) ?? [];
      existing.push(migration);
      byFrom.set(migration.from, existing);
    }

    const chain: Migration[] = [];
    let current = currentVersion;

    while (current !== targetVersion) {
      if (chain.length > this.migrations.length + 1) {
        throw new Error(`[${this.kind}] Migration cycle detected starting from "${currentVersion}"`);
      }

      const candidates = byFrom.get(current);
      if (!candidates || candidates.length === 0) {
        throw new Error(`[${this.kind}] No migration found from "${current}" to "${targetVersion}"`);
      }

      const next = candidates.find((m) => m.to === targetVersion) ?? candidates[0];
      chain.push(next);
      current = next.to;
    }

    return chain;
  }

  protected async applySteps(
    payload: unknown,
    fromVersion: string,
    steps: Migration[],
    logger: Logger,
  ): Promise<unknown> {
    let current = payload;
    let currentVersion = fromVersion;

    for (const migration of steps) {
      logger.info(`[${this.kind}] Applying: ${migration.describe()}`);
      const ctx: MigrationContext = {
        from: { schemaVersion: currentVersion, payload: current },
        to: { schemaVersion: migration.to },
        logger,
      };
      try {
        current = migration.apply(ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[${this.kind}] Migration failed at step "${migration.describe()}": ${message}`);
        throw new Error(`[${this.kind}] Migration aborted at step "${migration.describe()}": ${message}`);
      }
      currentVersion = migration.to;
    }

    return current;
  }

  protected async runSteps(
    payload: unknown,
    fromVersion: string,
    toVersion: string,
    logger: Logger,
  ): Promise<unknown> {
    const steps = this.plan(fromVersion, toVersion);
    return this.applySteps(payload, fromVersion, steps, logger);
  }

  abstract apply(input: T): Promise<T>;
}
