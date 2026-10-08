// ตาราง audit_logs: append-only (มีแค่ insert และ select)
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildWhere, buildPaging } from './core/sqlBuilder.js';

/**
 * @typedef {{ id: number, userId: number|null, action: string, targetTable: string|null, targetId: number|null,
 *   oldValues: object|null, newValues: object|null, ipAddress: string, userAgent: string|null, createdAt: Date }} AuditLog
 */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

const CASTS = { oldValues: 'json', newValues: 'json' };
const COLUMNS = 'a.id, a.user_id, a.action, a.target_table, a.target_id, a.old_values, a.new_values, a.ip_address, a.user_agent, a.created_at';
const SECRET_KEYS = new Set(['password', 'passwordHash', 'password_hash']);

// ลบ key ที่เป็นรหัสผ่านออกทุกชั้น
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEYS.has(key))
        .map(([key, v]) => [key, stripSecrets(v)]),
    );
  }
  return value;
}

const toJson = (value) => (value === undefined || value === null ? null : JSON.stringify(stripSecrets(value)));

/**
 * ลบ key password, passwordHash ออกจาก old/newValues อัตโนมัติก่อนบันทึก
 * @param {{ action: string, ipAddress: string, userId?: number, targetTable?: string, targetId?: number,
 *   oldValues?: object, newValues?: object, userAgent?: string }} data
 * @param {Options} [options]
 * @returns {Promise<number>} id ของ log
 * @example
 * await auditLogs.insert({ userId, action: 'CREATE', targetTable: 'loans', targetId: loan.id, newValues: loan, ipAddress }, { conn });
 */
export async function insert(
  { action, ipAddress, userId = null, targetTable = null, targetId = null, oldValues, newValues, userAgent = null },
  options = {},
) {
  const { insertId } = await execute(
    `INSERT INTO audit_logs (user_id, action, target_table, target_id, old_values, new_values, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, targetTable, targetId, toJson(oldValues), toJson(newValues), ipAddress, userAgent],
    options,
  );
  return insertId;
}

/**
 * oldValues, newValues เป็น object
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<AuditLog|null>}
 * @example
 * const log = await auditLogs.findById(15);
 */
export async function findById(id, options = {}) {
  const rows = await query(`SELECT ${COLUMNS} FROM audit_logs a WHERE a.id = ?`, [id], options);
  return toCamel(rows[0], CASTS);
}

/**
 * ใหม่สุดก่อน · from/to กรองตาม createdAt (รวมขอบ)
 * @param {{ userId?: number, action?: string, targetTable?: string, targetId?: number, from?: Date, to?: Date,
 *   page?: number, pageSize?: number }} [filter]
 * @param {Options} [options]
 * @returns {Promise<{ rows: AuditLog[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await auditLogs.list({ targetTable: 'loans', targetId: 7 });
 */
export async function list({ userId, action, targetTable, targetId, from, to, page, pageSize } = {}, options = {}) {
  const result = await queryPage(
    {
      select: COLUMNS,
      from: 'audit_logs a',
      where: buildWhere([
        userId !== undefined && ['a.user_id = ?', userId],
        action !== undefined && ['a.action = ?', action],
        targetTable !== undefined && ['a.target_table = ?', targetTable],
        targetId !== undefined && ['a.target_id = ?', targetId],
        from !== undefined && ['a.created_at >= ?', from],
        to !== undefined && ['a.created_at <= ?', to],
      ]),
      orderBy: 'ORDER BY a.created_at DESC, a.id DESC',
      paging: buildPaging(page, pageSize),
    },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows, CASTS) };
}
