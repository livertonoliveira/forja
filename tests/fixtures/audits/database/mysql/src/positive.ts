// MySQL audit fixture — positive (should trigger all checks)
import mysql from 'mysql2/promise';

const pool = mysql.createPool({ host: 'localhost' });

async function getUsersByEmail(email: string) {
  // missing index hint
  const [rows] = await pool.query(`SELECT * FROM users WHERE email = ?`, [email]);
  return rows;
}

// DDL with issues
const createTable = `
  CREATE TABLE users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(2000),
    email VARCHAR(2000),
    user_id INT NOT NULL,
    org_id INT NOT NULL
  ) ENGINE=MyISAM CHARSET=utf8;
`;

// innodb_buffer_pool too small
const mysqlConfig = `
  innodb_buffer_pool_size = 32M
  query_cache_type = 1
  query_cache_size = 67108864
`;
