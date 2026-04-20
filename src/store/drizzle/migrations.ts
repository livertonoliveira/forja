import fs from 'node:fs/promises';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const MIGRATIONS_FOLDER = './migrations';
const JOURNAL_PATH = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json');

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries: JournalEntry[];
}

export async function getPendingMigrationCount(connectionString: string): Promise<number> {
  const journalRaw = await fs.readFile(JOURNAL_PATH, 'utf-8');
  const journal = JSON.parse(journalRaw) as Journal;
  const totalMigrations = journal.entries.length;

  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS applied FROM information_schema.tables WHERE table_name = '__drizzle_migrations'`,
    );
    const tableExists = result.rows[0]?.applied > 0;
    if (!tableExists) return totalMigrations;

    const applied = await pool.query(`SELECT COUNT(*)::int AS count FROM "__drizzle_migrations"`);
    return totalMigrations - (applied.rows[0]?.count ?? 0);
  } finally {
    await pool.end();
  }
}
