// ตาราง permissions: สิทธิ์การทำงาน เช่น notebook.create
import { query, execute } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildSet, buildWhere } from './core/sqlBuilder.js';

/** @typedef {{ id: number, code: string, name: string, module: string, createdAt: Date, updatedAt: Date }} Permission */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

const WRITABLE = ['code', 'name', 'module'];
const SELECT = 'SELECT id, code, name, module, created_at, updated_at FROM permissions';

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<Permission|null>}
 * @example
 * const p = await permissions.findById(1);
 */
export async function findById(id, options = {}) {
  const rows = await query(`${SELECT} WHERE id = ?`, [id], options);
  return toCamel(rows[0]);
}

/**
 * @param {string} code
 * @param {Options} [options]
 * @returns {Promise<Permission|null>}
 * @example
 * const p = await permissions.findByCode('loan.create');
 */
export async function findByCode(code, options = {}) {
  const rows = await query(`${SELECT} WHERE code = ?`, [code], options);
  return toCamel(rows[0]);
}

/**
 * เรียงตาม module, code
 * @param {{ module?: string }} [filter]
 * @param {Options} [options]
 * @returns {Promise<Permission[]>}
 * @example
 * const loanPerms = await permissions.findAll({ module: 'loan' });
 */
export async function findAll({ module } = {}, options = {}) {
  const where = buildWhere([module !== undefined && ['module = ?', module]]);
  return toCamelRows(await query(`${SELECT} ${where.sql} ORDER BY module, code`, where.params, options));
}

/**
 * @param {{ code: string, name: string, module: string }} data
 * @param {Options} [options]
 * @returns {Promise<Permission>} code ซ้ำ → DbError DUPLICATE
 * @example
 * await permissions.insert({ code: 'report.export', name: 'Export รายงาน', module: 'report' });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, WRITABLE);
  const { insertId } = await execute(`INSERT INTO permissions ${sql}`, params, options);
  return findById(insertId, options);
}

/**
 * @param {number} id
 * @param {{ code?: string, name?: string, module?: string }} data
 * @param {Options} [options]
 * @returns {Promise<Permission|null>} null = ไม่พบ
 * @example
 * await permissions.update(5, { name: 'ชื่อใหม่' });
 */
export async function update(id, data, options = {}) {
  const { sql, params } = buildSet(data, WRITABLE);
  if (sql) {
    const { affectedRows } = await execute(`UPDATE permissions SET ${sql} WHERE id = ?`, [...params, id], options);
    if (!affectedRows) return null;
  }
  return findById(id, options);
}

/**
 * ลบถาวร การผูกใน role_permissions ถูกลบอัตโนมัติ (ON DELETE CASCADE)
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * await permissions.hardDelete(26);
 */
export async function hardDelete(id, options = {}) {
  const { affectedRows } = await execute('DELETE FROM permissions WHERE id = ?', [id], options);
  return affectedRows > 0;
}
