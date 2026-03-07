import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

// Read password from Docker secret file, fall back to env var
let password;
const secretFile = process.env.POSTGRES_PASSWORD_FILE;
if (secretFile) {
  try {
    password = fs.readFileSync(secretFile, 'utf8').trim();
  } catch (err) {
    console.error('Could not read password secret file:', err);
  }
}
if (!password) {
  password = process.env.POSTGRES_PASSWORD;
}

// Inject password into connection string
const connectionString = process.env.DATABASE_URL?.replace(
  /^(postgresql:\/\/[^:@]+)(@.*)/,
  `$1:${password}$2`
);

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();
export default pool;