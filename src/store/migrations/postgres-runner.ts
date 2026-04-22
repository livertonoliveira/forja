import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ne, eq } from 'drizzle-orm';
import type { Column, ColumnBaseConfig, ColumnDataType } from 'drizzle-orm';
import type { Migration } from './primitives.js';
import type { Logger } from '../../plugin/types.js';
import { MigrationRunner, type RunnerOptions } from './runner.js';
import { CURRENT_SCHEMA_VERSION } from '../../schemas/versioning.js';
import {
  runs,
  phases,
  findings,
  toolCalls,
  costEvents,
  gateDecisions,
  issueLinks,
} from '../drizzle/schema.js';

type DrizzleColumn = Column<ColumnBaseConfig<ColumnDataType, string>, object, object>;

interface VersionedTable {
  schemaVersion: DrizzleColumn;
  id: DrizzleColumn;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

const BATCH_SIZE = 500;

export class PostgresRunner extends MigrationRunner<string> {
  private readonly options: RunnerOptions;

  constructor(migrations: Migration[], options: RunnerOptions = {}) {
    super(migrations, 'postgres');
    this.options = options;
  }

  override async apply(connectionString: string): Promise<string> {
    const logger: Logger = this.options.logger ?? {
      info: (m) => console.log(`[migrate:postgres] ${m}`),
      warn: (m) => console.warn(`[migrate:postgres] WARN ${m}`),
      error: (m) => console.error(`[migrate:postgres] ERROR ${m}`),
    };

    const pool = new Pool({ connectionString });
    try {
      const db: AnyDb = drizzle(pool);
      const toVersion = this.options.to ?? CURRENT_SCHEMA_VERSION;

      const tables: VersionedTable[] = [
        runs as unknown as VersionedTable,
        phases as unknown as VersionedTable,
        findings as unknown as VersionedTable,
        toolCalls as unknown as VersionedTable,
        costEvents as unknown as VersionedTable,
        gateDecisions as unknown as VersionedTable,
        issueLinks as unknown as VersionedTable,
      ];

      for (const table of tables) {
        await this.migrateTable(db, table, toVersion, logger);
      }
    } finally {
      await pool.end();
    }

    return connectionString;
  }

  private async migrateTable(
    db: AnyDb,
    table: VersionedTable,
    toVersion: string,
    logger: Logger,
  ): Promise<void> {
    const tableName: string =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (table as any)[Symbol.for('drizzle:Name')] ?? (table as any)._.name ?? 'unknown';

    let totalMigrated = 0;
    let offset = 0;

    while (true) {
      const rows: Record<string, unknown>[] = await db
        .select()
        .from(table)
        .where(ne(table.schemaVersion, toVersion))
        .limit(BATCH_SIZE)
        .offset(offset);

      if (rows.length === 0) break;

      const rowsToMigrate = rows.filter((row) => {
        const rowVersion = row['schemaVersion'] as string;
        return this.plan(rowVersion, toVersion).length > 0;
      });

      if (this.options.dryRun) {
        for (const row of rowsToMigrate) {
          const rowVersion = row['schemaVersion'] as string;
          const steps = this.plan(rowVersion, toVersion);
          logger.info(
            `[postgres] dryRun — table "${tableName}" row "${row['id']}": would apply ${steps.length} step(s) from "${rowVersion}" to "${toVersion}"`,
          );
        }
        totalMigrated += rowsToMigrate.length;
      } else if (rowsToMigrate.length > 0) {
        await db.transaction(async (tx: AnyDb) => {
          for (const row of rowsToMigrate) {
            const rowVersion = row['schemaVersion'] as string;
            const steps = this.plan(rowVersion, toVersion);
            const migratedPayload = await this.applySteps(row, rowVersion, steps, logger);
            const payload = migratedPayload as Record<string, unknown>;
            await tx
              .update(table)
              .set({ ...payload, schemaVersion: toVersion })
              .where(eq(table.id, row['id'] as string));
          }
        });
        totalMigrated += rowsToMigrate.length;
      }

      if (rows.length < BATCH_SIZE) break;
      offset += rows.length;
    }

    logger.info(`[postgres] Table "${tableName}": migrated ${totalMigrated} row(s)`);
  }
}
