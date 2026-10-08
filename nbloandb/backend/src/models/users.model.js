// ตาราง users: บัญชีผู้ใช้และโปรไฟล์ (soft delete)
// ไม่ส่ง password_hash ออกไป ยกเว้น findAuthByEmail และ findPasswordHashById
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildSet, buildWhere, buildOrderBy, buildPaging, likeParam } from './core/sqlBuilder.js';

/**
 * @typedef {{ id: number, roleId: number, roleCode: string, roleName: string, memberCode: string|null,
 *   email: string, firstName: string, lastName: string, phone: string, avatarPath: string|null,
 *   isActive: boolean, lastLoginAt: Date|null, createdAt: Date, updatedAt: Date, deletedAt: Date|null }} User
 */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection, includeDeleted?: boolean }} Options */

const INSERTABLE = ['roleId', 'email', 'passwordHash', 'firstName', 'lastName', 'phone', 'memberCode', 'avatarPath'];
const UPDATABLE = ['roleId', 'memberCode', 'email', 'firstName', 'lastName', 'phone', 'avatarPath', 'isActive'];
const CASTS = { isActive: 'bool' };
const COLUMNS = `u.id, u.role_id, r.code AS role_code, r.name AS role_name, u.member_code, u.email,
  u.first_name, u.last_name, u.phone, u.avatar_path, u.is_active, u.last_login_at,
  u.created_at, u.updated_at, u.deleted_at`;
const FROM = 'users u JOIN roles r ON r.id = u.role_id';
const SORTABLE = { createdAt: 'u.created_at', firstName: 'u.first_name', email: 'u.email', lastLoginAt: 'u.last_login_at' };

const notDeleted = (options) => !options.includeDeleted && ['u.deleted_at IS NULL'];

async function findOne(condition, options) {
  const where = buildWhere([condition, notDeleted(options)]);
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} ${where.sql}`, where.params, options);
  return toCamel(rows[0], CASTS);
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<User|null>}
 * @example
 * const user = await users.findById(2);
 */
export async function findById(id, options = {}) {
  return findOne(['u.id = ?', id], options);
}

/**
 * @param {string} email
 * @param {Options} [options]
 * @returns {Promise<User|null>}
 * @example
 * const user = await users.findByEmail('member@example.com');
 */
export async function findByEmail(email, options = {}) {
  return findOne(['u.email = ?', email], options);
}

/**
 * @param {string} memberCode รหัสนักศึกษา/พนักงาน
 * @param {Options} [options]
 * @returns {Promise<User|null>}
 * @example
 * const user = await users.findByMemberCode('65000001');
 */
export async function findByMemberCode(memberCode, options = {}) {
  return findOne(['u.member_code = ?', memberCode], options);
}

/**
 * ใช้กับ login เท่านั้น ไม่คืนบัญชีที่ถูกลบ
 * @param {string} email
 * @param {{ conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<{ id: number, roleId: number, roleCode: string, email: string, passwordHash: string, isActive: boolean }|null>}
 * @example
 * const auth = await users.findAuthByEmail(email);
 * const ok = auth && auth.isActive && await bcrypt.compare(password, auth.passwordHash);
 */
export async function findAuthByEmail(email, options = {}) {
  const rows = await query(
    `SELECT u.id, u.role_id, r.code AS role_code, u.email, u.password_hash, u.is_active
       FROM ${FROM} WHERE u.email = ? AND u.deleted_at IS NULL`,
    [email],
    options,
  );
  return toCamel(rows[0], CASTS);
}

/**
 * ใช้ตรวจรหัสเดิมก่อนเปลี่ยนรหัสผ่าน
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<string|null>}
 * @example
 * const hash = await users.findPasswordHashById(userId);
 */
export async function findPasswordHashById(id, options = {}) {
  const where = buildWhere([['u.id = ?', id], notDeleted(options)]);
  const rows = await query(`SELECT u.password_hash FROM users u ${where.sql}`, where.params, options);
  return rows[0]?.password_hash ?? null;
}

/**
 * keyword ค้นใน ชื่อ, นามสกุล, อีเมล, รหัสสมาชิก, เบอร์โทร
 * @param {{ keyword?: string, roleId?: number, isActive?: boolean, page?: number, pageSize?: number, sort?: string }} [filter]
 *   sort ได้: createdAt, firstName, email, lastLoginAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: User[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await users.list({ keyword: 'สมชาย', isActive: true, sort: 'createdAt:desc' });
 */
export async function list({ keyword, roleId, isActive, page, pageSize, sort } = {}, options = {}) {
  const like = keyword ? likeParam(keyword) : null;
  const result = await queryPage(
    {
      select: COLUMNS,
      from: FROM,
      where: buildWhere([
        like && [
          'u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.member_code LIKE ? OR u.phone LIKE ?',
          like, like, like, like, like,
        ],
        roleId !== undefined && ['u.role_id = ?', roleId],
        isActive !== undefined && ['u.is_active = ?', isActive],
        notDeleted(options),
      ]),
      orderBy: buildOrderBy(sort, SORTABLE, 'createdAt:desc'),
      paging: buildPaging(page, pageSize),
    },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows, CASTS) };
}

async function isTaken(column, value, excludeId, options) {
  // นับบัญชีที่ถูก soft delete ด้วย เพราะ UNIQUE ใน DB ยังครอบอยู่
  const where = buildWhere([[`${column} = ?`, value], excludeId !== undefined && ['id <> ?', excludeId]]);
  const rows = await query(`SELECT 1 FROM users ${where.sql} LIMIT 1`, where.params, options);
  return rows.length > 0;
}

/**
 * @param {string} email
 * @param {{ excludeId?: number, conn?: import('mysql2/promise').PoolConnection }} [options] excludeId = id ของตัวเองตอนแก้โปรไฟล์
 * @returns {Promise<boolean>}
 * @example
 * if (await users.isEmailTaken(email, { excludeId: userId })) { ... }
 */
export async function isEmailTaken(email, { excludeId, ...options } = {}) {
  return isTaken('email', email, excludeId, options);
}

/**
 * @param {string} memberCode
 * @param {{ excludeId?: number, conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<boolean>}
 * @example
 * await users.isMemberCodeTaken('65000001');
 */
export async function isMemberCodeTaken(memberCode, { excludeId, ...options } = {}) {
  return isTaken('member_code', memberCode, excludeId, options);
}

/**
 * passwordHash ต้อง hash มาแล้ว (model ไม่ hash ให้)
 * @param {{ roleId: number, email: string, passwordHash: string, firstName: string, lastName: string,
 *   phone: string, memberCode?: string, avatarPath?: string }} data
 * @param {Options} [options]
 * @returns {Promise<User>} อีเมลซ้ำ → DUPLICATE (uq_users_email) · roleId ไม่มีจริง → FK_NOT_FOUND
 * @example
 * const user = await users.insert({ roleId: 2, email, passwordHash, firstName, lastName, phone });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, INSERTABLE);
  const { insertId } = await execute(`INSERT INTO users ${sql}`, params, options);
  return findById(insertId, options);
}

/**
 * แก้รหัสผ่านที่นี่ไม่ได้ (ใช้ updatePassword) แก้ได้เฉพาะบัญชีที่ยังไม่ถูกลบ
 * @param {number} id
 * @param {{ roleId?: number, memberCode?: string|null, email?: string, firstName?: string, lastName?: string,
 *   phone?: string, avatarPath?: string|null, isActive?: boolean }} data
 * @param {Options} [options]
 * @returns {Promise<User|null>}
 * @example
 * await users.update(2, { phone: '0812345678' });
 */
export async function update(id, data, options = {}) {
  const { sql, params } = buildSet(data, UPDATABLE);
  if (sql) {
    const where = buildWhere([['u.id = ?', id], notDeleted(options)]);
    const { affectedRows } = await execute(`UPDATE users u SET ${sql} ${where.sql}`, [...params, ...where.params], options);
    if (!affectedRows) return null;
  }
  return findById(id, options);
}

/**
 * @param {number} id
 * @param {string} passwordHash hash มาแล้ว
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * await users.updatePassword(userId, await bcrypt.hash(newPassword, 10));
 */
export async function updatePassword(id, passwordHash, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE users SET password_hash = ? WHERE id = ? AND deleted_at IS NULL',
    [passwordHash, id],
    options,
  );
  return affectedRows > 0;
}

/**
 * @param {number} id
 * @param {Date} [at] ค่าเริ่มต้น = ตอนนี้
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * await users.updateLastLogin(auth.id);
 */
export async function updateLastLogin(id, at = new Date(), options = {}) {
  const { affectedRows } = await execute(
    'UPDATE users SET last_login_at = ? WHERE id = ? AND deleted_at IS NULL',
    [at, id],
    options,
  );
  return affectedRows > 0;
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * await users.softDelete(5);
 */
export async function softDelete(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [id],
    options,
  );
  return affectedRows > 0;
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * await users.restore(5);
 */
export async function restore(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE users SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL',
    [id],
    options,
  );
  return affectedRows > 0;
}
