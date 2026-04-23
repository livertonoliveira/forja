let pool: import('pg').Pool | null = null;

export async function getPool(): Promise<import('pg').Pool | null> {
  if (!process.env.DATABASE_URL) return null;
  if (pool) return pool;
  try {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return pool;
  } catch {
    return null;
  }
}
