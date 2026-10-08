// ตาราง role_permissions: ผูกสิทธิ์เข้ากับ role
import { query, execute, withTransaction } from './core/db.js';
import { toCamelRows } from './core/mapper.js';
import { DbError } from './core/DbError.js';

/** @typedef {import('./permissions.model.js').Permission} Permission */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

/**
 * สิทธิ์ทั้งหมดของ role ใช้ในหน้าจัดการสิทธิ์ เรียงตาม module, code
 * @param {number} roleId
 * @param {Options} [options]
 * @returns {Promise<Permission[]>}
 * @example
 * const perms = await rolePermissions.findPermissionsByRoleId(2);
 */
export async function findPermissionsByRoleId(roleId, options = {}) {
  const rows = await query(
    `SELECT p.id, p.code, p.name, p.module, p.created_at, p.updated_at
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.module, p.code`,
    [roleId],
    options,
  );
  return toCamelRows(rows);
}

/**
 * รหัสสิทธิ์ของ role ให้ middleware cache ไว้หลัง login
 * @param {number} roleId
 * @param {Options} [options]
 * @returns {Promise<string[]>} เช่น ['loan.create', ...]
 * @example
 * const codes = await rolePermissions.findPermissionCodesByRoleId(auth.roleId);
 */
export async function findPermissionCodesByRoleId(roleId, options = {}) {
  const rows = await query(
    `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ? ORDER BY p.code`,
    [roleId],
    options,
  );
  return rows.map((row) => row.code);
}

/**
 * @param {number} roleId
 * @param {string} code รหัสสิทธิ์
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * if (await rolePermissions.hasPermission(user.roleId, 'loan.receive')) { ... }
 */
export async function hasPermission(roleId, code, options = {}) {
  const rows = await query(
    `SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ? AND p.code = ? LIMIT 1`,
    [roleId, code],
    options,
  );
  return rows.length > 0;
}

/**
 * ผูกสิทธิ์ให้ role
 * @param {number} roleId
 * @param {number} permissionId
 * @param {Options} [options]
 * @returns {Promise<boolean>} false = ผูกไว้แล้ว (ไม่ throw) · id ไม่มีจริง → DbError FK_NOT_FOUND
 * @example
 * await rolePermissions.add(2, 7);
 */
export async function add(roleId, permissionId, options = {}) {
  try {
    await execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, permissionId], options);
    return true;
  } catch (err) {
    if (err instanceof DbError && err.code === 'DUPLICATE') return false;
    throw err;
  }
}

/**
 * @param {number} roleId
 * @param {number} permissionId
 * @param {Options} [options]
 * @returns {Promise<boolean>} false = ไม่ได้ผูกไว้
 * @example
 * await rolePermissions.remove(2, 7);
 */
export async function remove(roleId, permissionId, options = {}) {
  const { affectedRows } = await execute(
    'DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?',
    [roleId, permissionId],
    options,
  );
  return affectedRows > 0;
}

/**
 * แทนที่สิทธิ์ทั้งหมดของ role แบบ atomic (ลบของเดิมแล้วใส่ใหม่)
 * ถ้าไม่ส่ง conn จะเปิด transaction เอง
 * @param {number} roleId
 * @param {number[]} permissionIds
 * @param {Options} [options]
 * @returns {Promise<number>} จำนวนสิทธิ์ของ role หลังแทนที่
 * @example
 * await rolePermissions.replaceForRole(2, [1, 2, 3]);
 */
export async function replaceForRole(roleId, permissionIds, options = {}) {
  const run = async (conn) => {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId], { conn });
    const ids = [...new Set(permissionIds)];
    if (ids.length) {
      await execute(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ${ids.map(() => '(?, ?)').join(', ')}`,
        ids.flatMap((id) => [roleId, id]),
        { conn },
      );
    }
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM role_permissions WHERE role_id = ?', [roleId], { conn });
    return Number(total);
  };
  return options.conn ? run(options.conn) : withTransaction(run);
}
