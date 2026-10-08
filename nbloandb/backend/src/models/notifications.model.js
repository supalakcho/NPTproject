// ตาราง notifications: แจ้งเตือนในระบบ
// userId และ assetCode หาจากการยืม/การจองที่อ้างถึง (ตารางไม่ได้เก็บ) ข้อความให้ service สร้างจาก type
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildWhere, buildPaging } from './core/sqlBuilder.js';
import { DbError } from './core/DbError.js';

/**
 * @typedef {{ id: number, type: 'loan_due_soon'|'loan_overdue'|'loan_cancelled'|'reservation_starting'|'reservation_cancelled',
 *   userId: number, loanId: number|null, reservationId: number|null, refDueAt: Date|null, assetCode: string,
 *   isRead: boolean, readAt: Date|null, createdAt: Date }} Notification
 */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

const CASTS = { isRead: 'bool' };
const COLUMNS = `nt.id, nt.type, COALESCE(l.user_id, r.user_id) AS user_id, nt.loan_id, nt.reservation_id,
  nt.ref_due_at, nb.asset_code, nt.read_at IS NOT NULL AS is_read, nt.read_at, nt.created_at`;
const JOINS = `LEFT JOIN loans l ON l.id = nt.loan_id
  LEFT JOIN reservations r ON r.id = nt.reservation_id`;
const FROM = `notifications nt ${JOINS}
  JOIN notebooks nb ON nb.id = COALESCE(l.notebook_id, r.notebook_id)`;
const OWNER_SQL = '(l.user_id = ? OR r.user_id = ?)';

/**
 * มี userId ให้ service ตรวจ ownership
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<Notification|null>}
 * @example
 * const n = await notifications.findById(3);
 */
export async function findById(id, options = {}) {
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE nt.id = ?`, [id], options);
  return toCamel(rows[0], CASTS);
}

/**
 * แจ้งเตือนของผู้ใช้ ใหม่สุดก่อน
 * @param {number} userId
 * @param {{ unreadOnly?: boolean, page?: number, pageSize?: number }} [filter]
 * @param {Options} [options]
 * @returns {Promise<{ rows: Notification[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await notifications.listByUser(userId, { unreadOnly: true });
 */
export async function listByUser(userId, { unreadOnly, page, pageSize } = {}, options = {}) {
  const result = await queryPage(
    {
      select: COLUMNS,
      from: FROM,
      where: buildWhere([[OWNER_SQL, userId, userId], unreadOnly && ['nt.read_at IS NULL']]),
      orderBy: 'ORDER BY nt.created_at DESC, nt.id DESC',
      paging: buildPaging(page, pageSize),
    },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows, CASTS) };
}

/**
 * ตัวเลขบนไอคอนกระดิ่ง
 * @param {number} userId
 * @param {Options} [options]
 * @returns {Promise<number>}
 * @example
 * const unread = await notifications.countUnreadByUser(userId);
 */
export async function countUnreadByUser(userId, options = {}) {
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM notifications nt ${JOINS} WHERE ${OWNER_SQL} AND nt.read_at IS NULL`,
    [userId, userId],
    options,
  );
  return Number(total);
}

/**
 * สร้างแจ้งเตือนถ้ายังไม่มีแจ้งเตือนเดียวกัน (type + loanId/reservationId + refDueAt) ให้ scheduled job เรียกซ้ำได้ปลอดภัย
 * @param {{ type: Notification['type'], loanId?: number, reservationId?: number, refDueAt?: Date }} data
 *   loan_due_soon / loan_overdue ต้องส่ง refDueAt = dueAt ของการยืม
 * @param {Options} [options]
 * @returns {Promise<Notification|null>} null = มีแจ้งเตือนนี้อยู่แล้ว (ไม่ throw) · type ไม่ตรงกับ target → CHECK_FAILED
 * @example
 * await notifications.insertIfNotExists({ type: 'loan_due_soon', loanId: loan.id, refDueAt: loan.dueAt });
 */
export async function insertIfNotExists({ type, loanId = null, reservationId = null, refDueAt = null }, options = {}) {
  // เช็คด้วย <=> เพราะ UNIQUE ไม่กันแถวที่ ref_due_at เป็น NULL (เช่น loan_cancelled)
  try {
    const { affectedRows, insertId } = await execute(
      `INSERT INTO notifications (type, loan_id, reservation_id, ref_due_at)
       SELECT ?, ?, ?, ? FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM notifications
                           WHERE type = ? AND loan_id <=> ? AND reservation_id <=> ? AND ref_due_at <=> ?)`,
      [type, loanId, reservationId, refDueAt, type, loanId, reservationId, refDueAt],
      options,
    );
    return affectedRows ? findById(insertId, options) : null;
  } catch (err) {
    if (err instanceof DbError && err.code === 'DUPLICATE') return null;
    throw err;
  }
}

/**
 * อ่านได้เฉพาะของเจ้าของ (userId อยู่ใน WHERE) อ่านซ้ำไม่เปลี่ยน readAt เดิม
 * @param {number} id
 * @param {number} userId
 * @param {Options} [options]
 * @returns {Promise<boolean>} false = ไม่พบหรือไม่ใช่ของผู้ใช้นี้
 * @example
 * await notifications.markRead(notificationId, userId);
 */
export async function markRead(id, userId, options = {}) {
  const { affectedRows } = await execute(
    `UPDATE notifications nt ${JOINS} SET nt.read_at = COALESCE(nt.read_at, NOW())
      WHERE nt.id = ? AND ${OWNER_SQL}`,
    [id, userId, userId],
    options,
  );
  return affectedRows > 0;
}

/**
 * @param {number} userId
 * @param {Options} [options]
 * @returns {Promise<number>} จำนวนที่เปลี่ยนจากยังไม่อ่านเป็นอ่านแล้ว
 * @example
 * await notifications.markAllRead(userId);
 */
export async function markAllRead(userId, options = {}) {
  const { affectedRows } = await execute(
    `UPDATE notifications nt ${JOINS} SET nt.read_at = NOW() WHERE ${OWNER_SQL} AND nt.read_at IS NULL`,
    [userId, userId],
    options,
  );
  return affectedRows;
}
