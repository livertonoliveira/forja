// MySQL audit fixture — negative (should NOT trigger checks)
import mysql from 'mysql2/promise';

const pool = mysql.createPool({ host: 'localhost' });

async function getUsersByEmail(email: string) {
  // explicit USE INDEX hint
  const [rows] = await pool.query(`SELECT id, name FROM users USE INDEX (idx_email) WHERE email = ? LIMIT 100`, [email]);
  return rows;
}

const createTable = `
  CREATE TABLE users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    org_id INT NOT NULL,
    FOREIGN KEY (org_id) REFERENCES orgs(id)
  ) ENGINE=InnoDB CHARSET=utf8mb4;
`;

const mysqlConfig = `
  innodb_buffer_pool_size = 2G
  query_cache_type = 0
  query_cache_size = 0
`;
