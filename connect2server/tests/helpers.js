// Must run before src/config.js is imported.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_TEST_NAME ?? 'usermgmt_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.MAX_FAILED_LOGINS = '3';

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';

const { closeDb, createPool, query } = await import('../src/db.js');
const { config } = await import('../src/config.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/utils/password.js');

export const PASSWORD = 'Str0ng!Passw0rd';
export { query };

// Rebuilds the throwaway test database (DB_TEST_NAME, default usermgmt_test) from
// db/schema.sql + db/seed.sql. Returns { close }.
export async function setupDb() {
  const name = config.db.database;
  const server = createPool({ database: null });
  await server.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await server.query(`CREATE DATABASE \`${name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await server.end();
  const db = createPool({ multipleStatements: true });
  for (const f of ['schema.sql', 'seed.sql']) {
    await db.query(await readFile(new URL(`../db/${f}`, import.meta.url), 'utf8'));
  }
  await db.end();
  return { close: closeDb };
}

export const api = () => request(createApp());

// Inserts a user straight into the DB (bypasses the API) with the given roles.
export async function insertUser(username, roles = ['user'], password = PASSWORD) {
  const hash = await hashPassword(password);
  const id = randomUUID();
  await query('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
    [id, username, `${username}@example.com`, hash]);
  await query('INSERT INTO user_profiles (user_id) VALUES (?)', [id]);
  await query('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name IN (?)', [id, roles]);
  return id;
}

export async function tokenFor(username, password = PASSWORD) {
  const res = await api().post('/api/v1/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

export const newUserBody = (username, extra = {}) => ({
  username, email: `${username}@example.com`, password: PASSWORD, ...extra,
});

export async function auditActions(where = '', params = []) {
  const { rows } = await query(`SELECT action FROM audit_logs ${where} ORDER BY id`, params);
  return rows.map((r) => r.action);
}
