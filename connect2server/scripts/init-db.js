// Creates the database (if missing) and applies db/schema.sql + db/seed.sql. All files are idempotent.
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';
import { createPool } from '../src/db.js';

const name = config.db.database;
if (!/^\w+$/.test(name)) throw new Error(`Invalid DB_NAME: ${name}`);

const server = createPool({ database: null });
await server.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await server.end();

const db = createPool({ multipleStatements: true });
for (const file of ['schema.sql', 'seed.sql']) {
  await db.query(await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8'));
  console.log(`applied db/${file} to ${name}`);
}
await db.end();
