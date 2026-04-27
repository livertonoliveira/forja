// PostgreSQL audit fixture — negative (should NOT trigger checks)
import { Pool } from 'pg';

const pool = new Pool({ host: 'localhost', max: 10 });

async function getUsersByName(name: string) {
  // indexed column, explicit columns
  const result = await pool.query(`SELECT id, name, email FROM users WHERE name = $1 LIMIT 100`, [name]);
  return result.rows;
}

async function lockUser(id: number) {
  const client = await pool.connect();
  try {
    await client.query(`SET lock_timeout = '5s'`);
    const result = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [id]);
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateUserBalance(userId: number, amount: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE accounts SET balance = balance - $1 WHERE user_id = $2`, [amount, userId]);
    await client.query(`INSERT INTO transactions (user_id, amount) VALUES ($1, $2)`, [userId, amount]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const createUsersTable = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    metadata JSONB,
    org_id INTEGER NOT NULL,
    FOREIGN KEY (org_id) REFERENCES orgs(id) DEFERRABLE INITIALLY DEFERRED
  )
`;

const autovacuumConfig = `autovacuum = on`;
const triggerDef = `CREATE TRIGGER update_users_ts BEFORE UPDATE ON users FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION update_timestamp()`;
