// ตาราง roles: บทบาทผู้ใช้ เช่น admin, member
import { query, execute } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildSet } from './core/sqlBuilder.js';

/** @typedef {{ id: number, code: string, name: string, description: string|null, createdAt: Date, updatedAt: Date }} Role */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

const WRITABLE = ['code', 'name', 'description'];
const SELECT = 'SELECT id, code, name, description, created_at, updated_at FROM roles';

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<Role|null>}
 * @example
 * const role = await roles.findById(1);
 */
export async function findById(id, options = {}) {
  const rows = await query(`${SELECT} WHERE id = ?`, [id], options);
  return toCamel(rows[0]);
}

/**
 * @param {string} code เช่น 'member' ใช้ตอนสมัครสมาชิก
 * @param {Options} [options]
 * @returns {Promise<Role|null>}
 * @example
 * const member = await roles.findByCode('member');
 */
export async function findByCode(code, options = {}) {
  const rows = await query(`${SELECT} WHERE code = ?`, [code], options);
  return toCamel(rows[0]);
}

/**
 * ทุก role (ข้อมูลน้อย ไม่แบ่งหน้า) เรียงตาม id
 * @param {Options} [options]
 * @returns {Promise<Role[]>}
 * @example
 * const all = await roles.findAll();
 */
export async function findAll(options = {}) {
  return toCamelRows(await query(`${SELECT} ORDER BY id`, [], options));
}

/**
 * @param {{ code: string, name: string, description?: string }} data
 * @param {Options} [options]
 * @returns {Promise<Role>} code ซ้ำ → DbError DUPLICATE (uq_roles_code)
 * @example
 * const role = await roles.insert({ code: 'staff', name: 'เจ้าหน้าที่' });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, WRITABLE);
  const { insertId } = await execute(`INSERT INTO roles ${sql}`, params, options);
  return findById(insertId, options);
}

/**
 * @param {number} id
 * @param {{ code?: string, name?: string, description?: string }} data ส่งเฉพาะ field ที่จะแก้
 * @param {Options} [options]
 * @returns {Promise<Role|null>} null = ไม่พบ
 * @example
 * await roles.update(3, { name: 'เจ้าหน้าที่คลัง' });
 */
export async function update(id, data, options = {}) {
  const { sql, params } = buildSet(data, WRITABLE);
  if (sql) {
    const { affectedRows } = await execute(`UPDATE roles SET ${sql} WHERE id = ?`, [...params, id], options);
    if (!affectedRows) return null;
  }
  return findById(id, options);
}

/**
 * ลบถาวร ยังมีผู้ใช้ใน role นี้ → DbError FK_IN_USE
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>} false = ไม่พบ
 * @example
 * await roles.hardDelete(3);
 */
export async function hardDelete(id, options = {}) {
  const { affectedRows } = await execute('DELETE FROM roles WHERE id = ?', [id], options);
  return affectedRows > 0;
}
