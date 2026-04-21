// PostgreSQL audit fixture — positive (should trigger all checks)
import { Pool } from 'pg';

// connection pool without max
const pool = new Pool({ host: 'localhost' });

async function getUsersByName(name: string) {
  // missing index hint, WHERE clause
  const result = await pool.query(`SELECT * FROM users WHERE name = $1`, [name]);
  return result.rows;
}

async function getAllUsers() {
  // SELECT * without LIMIT — sequential scan risk
  const result = await pool.query(`SELECT * FROM users`);
  return result.rows;
}

async function lockUser(id: number) {
  // FOR UPDATE — no preceding timeout
  const result = await pool.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [id]);
  return result.rows;
}

async function updateUserBalance(userId: number, amount: number) {
  // multiple queries without transaction
  await pool.query(`UPDATE accounts SET balance = balance - $1 WHERE user_id = $2`, [amount, userId]);
  await pool.query(`INSERT INTO transactions (user_id, amount) VALUES ($1, $2)`, [userId, amount]);
}

// DDL with issues
const createUsersTable = `
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT,
    metadata JSON,
    FOREIGN KEY (org_id) REFERENCES orgs(id)
  )
`;

// autovacuum disabled
const pgConfig = `autovacuum = off`;

// CREATE TRIGGER without WHEN
const triggerDef = `CREATE TRIGGER update_users_ts BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp()`;
