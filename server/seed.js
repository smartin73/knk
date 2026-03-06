#!/usr/bin/env node
// Usage: node seed.js
// Run once after first deploy to create the admin user
// Reads ADMIN_PASSWORD and DATABASE_URL from environment

import pg from 'pg';
import bcrypt from 'bcrypt';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  await client.connect();

  const username = 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) { console.error('Set ADMIN_PASSWORD env var'); process.exit(1); }

  const hash = await bcrypt.hash(password, 12);

  await client.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
    [username, hash]
  );

  console.log(`✓ User '${username}' created/updated`);
  await client.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
