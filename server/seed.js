#!/usr/bin/env node
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';
import fs from 'fs';

const { Client } = pg;

// Read password from Docker secret
let password;
const secretFile = process.env.POSTGRES_PASSWORD_FILE;
if (secretFile) {
  try { password = fs.readFileSync(secretFile, 'utf8').trim(); } catch {}
}
if (!password) password = process.env.POSTGRES_PASSWORD;

const connectionString = process.env.DATABASE_URL?.replace(
  /^(postgresql:\/\/[^:@]+)(@.*)/,
  `$1:${password}$2`
);

const client = new Client({ connectionString });

async function seed() {
  await client.connect();

  const username = 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) { console.error('Set ADMIN_PASSWORD env var'); process.exit(1); }

  const hash = await bcrypt.hash(adminPassword, 12);

  await client.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
    [username, hash]
  );

  console.log(`✓ User 'admin' created/updated`);
  await client.end();
}

seed().catch(err => { console.error(err); process.exit(1); });