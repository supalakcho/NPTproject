import { randomUUID } from 'node:crypto';
import { query, transaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { hashPassword } from '../utils/password.js';
import { writeAudit } from '../utils/audit.js';

const USER_SELECT = `
  SELECT u.id, u.username, u.email, s.code AS status,
         p.first_name, p.last_name, p.phone,
         u.last_login_at, u.created_at, u.updated_at,
         (SELECT GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ',')
            FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id) AS roles_csv
    FROM users u
    JOIN user_statuses s ON s.id = u.status_id
    LEFT JOIN user_profiles p ON p.user_id = u.id`;

export const toDto = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  phone: row.phone,
  status: row.status,
  roles: row.roles_csv ? row.roles_csv.split(',') : [],
  lastLoginAt: row.last_login_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SORT_COLUMNS = {
  username: 'u.username',
  email: 'u.email',
  createdAt: 'u.created_at',
  lastLoginAt: 'u.last_login_at',
};

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function mapUniqueViolation(err) {
  if (err.code !== 'ER_DUP_ENTRY') return err;
  // MariaDB: "Duplicate entry '<value>' for key '<index>'"; match the index, not the value.
  const where = /for key '([^']+)'/.exec(err.message ?? '')?.[1] ?? '';
  if (where.includes('username')) return conflict('USERNAME_TAKEN', 'Username is already in use');
  if (where.includes('email')) return conflict('EMAIL_TAKEN', 'Email is already in use');
  return err;
}

async function findUser(db, id, { lock = false } = {}) {
  const { rows } = await db.query(
    `${USER_SELECT} WHERE u.id = ? AND u.deleted_at IS NULL ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!rows.length) throw notFound('USER_NOT_FOUND', 'User not found');
  return toDto(rows[0]);
}

export const getUser = (id) => findUser({ query }, id);

export async function listUsers({ page, limit, search, role, status, sort, order }) {
  const where = ['u.deleted_at IS NULL'];
  const params = [];
  const bind = (value) => (params.push(value), '?');

  if (search) {
    const pattern = `%${escapeLike(search.toLowerCase())}%`;
    where.push(`(u.username LIKE ${bind(pattern)} OR u.email LIKE ${bind(pattern)}
                 OR lower(concat_ws(' ', p.first_name, p.last_name)) LIKE ${bind(pattern)})`);
  }
  if (status) where.push(`s.code = ${bind(status)}`);
  if (role) {
    where.push(`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                         WHERE ur.user_id = u.id AND r.name = ${bind(role)})`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const { rows: [{ total }] } = await query(
    `SELECT COUNT(*) AS total FROM users u JOIN user_statuses s ON s.id = u.status_id
       LEFT JOIN user_profiles p ON p.user_id = u.id ${whereSql}`, params);

  const dir = order === 'desc' ? 'DESC' : 'ASC';
  const { rows } = await query(
    `${USER_SELECT} ${whereSql}
      ORDER BY (${SORT_COLUMNS[sort]} IS NULL), ${SORT_COLUMNS[sort]} ${dir}, u.id
      LIMIT ${bind(limit)} OFFSET ${bind((page - 1) * limit)}`, params);

  return {
    items: rows.map(toDto),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function resolveRoleIds(db, names) {
  const unique = [...new Set(names)];
  const { rows } = await db.query('SELECT id, name FROM roles WHERE name IN (?)', [unique]);
  const unknown = unique.filter((n) => !rows.some((r) => r.name === n));
  if (unknown.length) throw badRequest('INVALID_ROLE', `Unknown role(s): ${unknown.join(', ')}`);
  return rows.map((r) => r.id);
}

async function otherActiveAdmins(db, excludeId) {
  const { rows: [{ n }] } = await db.query(
    `SELECT COUNT(*) AS n
       FROM users u
       JOIN user_statuses s ON s.id = u.status_id AND s.code = 'active'
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.name = 'admin'
      WHERE u.deleted_at IS NULL AND u.id <> ?`, [excludeId]);
  return n;
}

async function assertNotLastAdmin(db, target) {
  const isActiveAdmin = target.status === 'active' && target.roles.includes('admin');
  if (isActiveAdmin && (await otherActiveAdmins(db, target.id)) === 0) {
    throw conflict('LAST_ADMIN', 'This would leave the system without an active admin');
  }
}

export async function createUser(actor, input, ctx) {
  const roles = input.roles ?? ['user'];
  if (input.roles && !actor.permissions.includes('user:assign_role')) {
    throw forbidden('FORBIDDEN', 'You may not choose roles; omit "roles" to create a standard user');
  }
  const passwordHash = await hashPassword(input.password);

  try {
    return await transaction(async (tx) => {
      const roleIds = await resolveRoleIds(tx, roles);
      const id = randomUUID();
      await tx.query(
        `INSERT INTO users (id, username, email, password_hash, status_id, created_by, updated_by)
         VALUES (?, ?, ?, ?, (SELECT id FROM user_statuses WHERE code = ?), ?, ?)`,
        [id, input.username, input.email, passwordHash, input.status ?? 'active', actor.id, actor.id]);
      await tx.query(
        'INSERT INTO user_profiles (user_id, first_name, last_name, phone) VALUES (?, ?, ?, ?)',
        [id, input.firstName ?? null, input.lastName ?? null, input.phone ?? null]);
      await insertRoles(tx, id, roleIds);

      const user = await findUser(tx, id);
      await writeAudit(tx, {
        actorId: actor.id, action: 'USER_CREATED', entityType: 'user', entityId: user.id, ctx,
        details: { username: user.username, email: user.email, status: user.status, roles: user.roles },
      });
      return user;
    });
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

const PROFILE_FIELDS = ['firstName', 'lastName', 'phone'];
const insertRoles = (db, userId, roleIds) => db.query(
  'INSERT INTO user_roles (user_id, role_id) VALUES ?', [roleIds.map((roleId) => [userId, roleId])]);

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function updateUser(actor, id, input, ctx) {
  const touchesRoles = input.roles !== undefined;
  if (touchesRoles && !actor.permissions.includes('user:assign_role')) {
    throw forbidden('FORBIDDEN', 'You may not change roles');
  }

  try {
    return await transaction(async (tx) => {
      const before = await findUser(tx, id, { lock: true });
      const after = { ...before };
      for (const key of [...PROFILE_FIELDS, 'email', 'status', 'roles']) {
        if (input[key] !== undefined) after[key] = key === 'roles' ? [...new Set(input[key])].sort() : input[key];
      }

      const changes = {};
      for (const key of Object.keys(after)) {
        if (!sameValue(before[key], after[key])) changes[key] = { from: before[key], to: after[key] };
      }
      if (!Object.keys(changes).length) return before;

      const losesAdmin = (changes.status && after.status !== 'active') ||
        (changes.roles && before.roles.includes('admin') && !after.roles.includes('admin'));
      if (losesAdmin) {
        if (actor.id === id) throw conflict('SELF_LOCKOUT', 'You cannot deactivate yourself or remove your own admin role');
        await assertNotLastAdmin(tx, before);
      }

      const deactivating = changes.status && after.status === 'inactive';
      await tx.query(
        `UPDATE users SET email = ?,
                status_id = (SELECT id FROM user_statuses WHERE code = ?),
                token_version = token_version + ?,
                updated_by = ?
          WHERE id = ?`,
        [after.email, after.status, deactivating ? 1 : 0, actor.id, id]);
      await tx.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, phone) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           first_name = VALUES(first_name), last_name = VALUES(last_name), phone = VALUES(phone)`,
        [id, after.firstName, after.lastName, after.phone]);
      if (changes.roles) {
        const roleIds = await resolveRoleIds(tx, after.roles);
        await tx.query('DELETE FROM user_roles WHERE user_id = ?', [id]);
        await insertRoles(tx, id, roleIds);
      }

      await writeAudit(tx, {
        actorId: actor.id, action: 'USER_UPDATED', entityType: 'user', entityId: id, ctx, details: { changes },
      });
      return findUser(tx, id);
    });
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

export async function deleteUser(actor, id, ctx) {
  if (actor.id === id) throw conflict('SELF_DELETE', 'You cannot delete your own account');
  await transaction(async (tx) => {
    const target = await findUser(tx, id, { lock: true });
    await assertNotLastAdmin(tx, target);
    await tx.query(
      'UPDATE users SET deleted_at = NOW(), token_version = token_version + 1, updated_by = ? WHERE id = ?',
      [actor.id, id]);
    await writeAudit(tx, {
      actorId: actor.id, action: 'USER_DELETED', entityType: 'user', entityId: id, ctx,
      details: { username: target.username, email: target.email },
    });
  });
}

export async function resetPassword(actor, id, newPassword, ctx) {
  const passwordHash = await hashPassword(newPassword);
  await transaction(async (tx) => {
    await findUser(tx, id, { lock: true });
    await tx.query(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW(), token_version = token_version + 1,
              failed_login_count = 0, locked_until = NULL, updated_by = ?
        WHERE id = ?`, [passwordHash, actor.id, id]);
    await writeAudit(tx, { actorId: actor.id, action: 'PASSWORD_RESET', entityType: 'user', entityId: id, ctx });
  });
}

export async function listRoles() {
  const { rows } = await query(
    `SELECT r.name, r.description,
            GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ',') AS permissions_csv
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id, r.name, r.description ORDER BY r.name`);
  return rows.map(({ permissions_csv: csv, ...role }) => ({ ...role, permissions: csv ? csv.split(',') : [] }));
}

export async function listAuditLogs({ page, limit, action, entityType, entityId, actorId, from, to }) {
  const where = [];
  const params = [];
  const bind = (v) => (params.push(v), '?');
  if (action) where.push(`a.action = ${bind(action)}`);
  if (entityType) where.push(`a.entity_type = ${bind(entityType)}`);
  if (entityId) where.push(`a.entity_id = ${bind(entityId)}`);
  if (actorId) where.push(`a.actor_user_id = ${bind(actorId)}`);
  if (from) where.push(`a.created_at >= ${bind(from)}`);
  if (to) where.push(`a.created_at <= ${bind(to)}`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: [{ total }] } = await query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
  const { rows } = await query(
    `SELECT CAST(a.id AS CHAR) AS id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.user_agent,
            a.created_at, a.actor_user_id, u.username AS actor_username
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
       ${whereSql}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ${bind(limit)} OFFSET ${bind((page - 1) * limit)}`, params);

  return {
    items: rows.map((r) => ({
      id: r.id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, details: JSON.parse(r.details),
      ipAddress: r.ip_address, userAgent: r.user_agent, createdAt: r.created_at,
      actor: r.actor_user_id ? { id: r.actor_user_id, username: r.actor_username } : null,
    })),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
