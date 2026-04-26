import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, desc, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { hookDlq } from './drizzle/schema.js';
import type { DLQEntry, NewDLQEntry } from './types.js';

let _db: NodePgDatabase | null = null;

function getDb(): NodePgDatabase | null {
  if (_db) return _db;
  const url = process.env.FORJA_STORE_URL ?? process.env.DATABASE_URL;
  if (!url) return null;
  try {
    _db = drizzle(new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 }));
    return _db;
  } catch {
    return null;
  }
}

type DrizzleHookDlq = typeof hookDlq.$inferSelect;

function toEntry(r: DrizzleHookDlq): DLQEntry {
  return {
    id: r.id,
    hookType: r.hookType,
    payload: r.payload,
    errorMessage: r.errorMessage,
    attempts: r.attempts ?? 0,
    lastAttemptAt: r.lastAttemptAt instanceof Date ? r.lastAttemptAt.toISOString() : r.lastAttemptAt,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt as string),
    status: r.status as DLQEntry['status'],
  };
}

export async function enqueueDLQ(entry: NewDLQEntry): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(hookDlq).values({
    hookType: entry.hookType,
    payload: entry.payload as object,
    errorMessage: entry.errorMessage ?? null,
    attempts: entry.attempts ?? 0,
    lastAttemptAt: entry.lastAttemptAt ? new Date(entry.lastAttemptAt) : null,
  });
}

export async function listDLQ(filters: { status?: DLQEntry['status']; limit?: number } = {}): Promise<DLQEntry[]> {
  const db = getDb();
  if (!db) return [];
  const conditions = filters.status ? [eq(hookDlq.status, filters.status)] : [];
  const rows = conditions.length > 0
    ? await db.select().from(hookDlq).where(and(...conditions)).orderBy(desc(hookDlq.createdAt)).limit(filters.limit ?? 100)
    : await db.select().from(hookDlq).orderBy(desc(hookDlq.createdAt)).limit(filters.limit ?? 100);
  return rows.map(toEntry);
}

export async function reprocessDLQ(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.update(hookDlq)
    .set({ status: 'dead', attempts: 0, lastAttemptAt: null })
    .where(eq(hookDlq.id, id));
}

export async function ignoreDLQ(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.update(hookDlq)
    .set({ status: 'ignored' })
    .where(eq(hookDlq.id, id));
}
