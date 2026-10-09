// Creates the first admin from ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD env vars.
// Does nothing if the username already exists. Remove ADMIN_PASSWORD from the environment afterwards.
import { randomUUID } from 'node:crypto';
import { closeDb, transaction } from '../src/db.js';
import { createUserBody } from '../src/schemas.js';
import { hashPassword } from '../src/utils/password.js';
import { writeAudit } from '../src/utils/audit.js';

const parsed = createUserBody.safeParse({
  username: process.env.ADMIN_USERNAME ?? 'admin',
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  firstName: 'System',
  lastName: 'Administrator',
});
if (!parsed.success) {
  console.error('Invalid ADMIN_* settings:', parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
  process.exit(1);
}
const admin = parsed.data;
const passwordHash = await hashPassword(admin.password);

const created = await transaction(async (tx) => {
  const { rows: existing } = await tx.query(
    'SELECT 1 FROM users WHERE (username = ? OR email = ?) AND deleted_at IS NULL', [admin.username, admin.email]);
  if (existing.length) return false;
  const id = randomUUID();
  await tx.query('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)',
    [id, admin.username, admin.email, passwordHash]);
  await tx.query('INSERT INTO user_profiles (user_id, first_name, last_name) VALUES (?, ?, ?)',
    [id, admin.firstName, admin.lastName]);
  await tx.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = 'admin'", [id]);
  await writeAudit(tx, { action: 'USER_CREATED', entityType: 'user', entityId: id, details: { username: admin.username, via: 'seed-admin' } });
  return true;
});

console.log(created ? `Admin "${admin.username}" created.` : 'Admin already exists; nothing changed.');
await closeDb();
