// ตาราง reservations: การจองล่วงหน้า (ไม่มี update ทั่วไปและไม่มี delete ใช้ cancel แทน)
// status คำนวณใน SQL ทุกครั้ง: upcoming / active / fulfilled / expired / cancelled
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildWhere, buildOrderBy, buildPaging } from './core/sqlBuilder.js';

/**
 * @typedef {{ id: number, userId: number, userFullName: string, notebookId: number, assetCode: string,
 *   modelName: string, startAt: Date, endAt: Date, status: 'upcoming'|'active'|'fulfilled'|'expired'|'cancelled',
 *   loanId: number|null, cancelledAt: Date|null, cancelledBy: number|null, cancelReason: string|null,
 *   createdAt: Date, updatedAt: Date }} Reservation
 */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

const GRACE_MINUTES_SQL =
  "(SELECT CAST(s.setting_value AS UNSIGNED) FROM settings s WHERE s.setting_key = 'reservation_grace_minutes')";

// สถานะของการจอง alias r (เงื่อนไขช่วงผ่อนผันเหมือน View v_notebook_status)
export const RESERVATION_STATUS_SQL = `CASE
    WHEN r.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN EXISTS (SELECT 1 FROM loans lr WHERE lr.reservation_id = r.id) THEN 'fulfilled'
    WHEN NOW() < r.start_at THEN 'upcoming'
    WHEN NOW() < r.end_at AND TIMESTAMPDIFF(MINUTE, r.start_at, NOW()) <= ${GRACE_MINUTES_SQL} THEN 'active'
    ELSE 'expired'
  END`;

// การจองที่ยังมีผล = ไม่ยกเลิก ไม่หมดอายุ ยังไม่รับเครื่อง
export const RESERVATION_IN_EFFECT_SQL = `(${RESERVATION_STATUS_SQL}) IN ('upcoming', 'active')`;

const WRITABLE = ['userId', 'notebookId', 'startAt', 'endAt'];
const COLUMNS = `r.id, r.user_id, CONCAT(u.first_name, ' ', u.last_name) AS user_full_name, r.notebook_id,
  n.asset_code, m.model_name, r.start_at, r.end_at, ${RESERVATION_STATUS_SQL} AS status, l.id AS loan_id,
  r.cancelled_at, r.cancelled_by, r.cancel_reason, r.created_at, r.updated_at`;
const FROM = `reservations r
  JOIN users u ON u.id = r.user_id
  JOIN notebooks n ON n.id = r.notebook_id
  JOIN notebook_models m ON m.id = n.model_id
  LEFT JOIN loans l ON l.reservation_id = r.id`;
const SORTABLE = { startAt: 'r.start_at', createdAt: 'r.created_at' };

async function findMany(conditions, orderBy, options) {
  const where = buildWhere(conditions);
  return toCamelRows(await query(`SELECT ${COLUMNS} FROM ${FROM} ${where.sql} ${orderBy}`, where.params, options));
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<Reservation|null>}
 * @example
 * const res = await reservations.findById(10);
 */
export async function findById(id, options = {}) {
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE r.id = ?`, [id], options);
  return toCamel(rows[0]);
}

/**
 * สำหรับแอดมิน · from/to กรองตาม startAt (รวมขอบ)
 * @param {{ userId?: number, notebookId?: number, status?: Reservation['status'], from?: Date, to?: Date,
 *   page?: number, pageSize?: number, sort?: string }} [filter] sort ได้: startAt, createdAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: Reservation[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await reservations.list({ status: 'upcoming', sort: 'startAt:asc' });
 */
export async function list({ userId, notebookId, status, from, to, page, pageSize, sort } = {}, options = {}) {
  const result = await queryPage(
    {
      select: COLUMNS,
      from: FROM,
      where: buildWhere([
        userId !== undefined && ['r.user_id = ?', userId],
        notebookId !== undefined && ['r.notebook_id = ?', notebookId],
        status !== undefined && [`${RESERVATION_STATUS_SQL} = ?`, status],
        from !== undefined && ['r.start_at >= ?', from],
        to !== undefined && ['r.start_at <= ?', to],
      ]),
      orderBy: buildOrderBy(sort, SORTABLE, 'startAt:desc'),
      paging: buildPaging(page, pageSize),
    },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows) };
}

/**
 * ประวัติการจองของสมาชิก
 * @param {number} userId
 * @param {{ status?: Reservation['status'], page?: number, pageSize?: number, sort?: string }} [filter] sort ได้: startAt, createdAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: Reservation[], total: number, page: number, pageSize: number }>}
 * @example
 * const mine = await reservations.listByUser(userId, { page: 1 });
 */
export async function listByUser(userId, { status, page, pageSize, sort } = {}, options = {}) {
  return list({ userId, status, page, pageSize, sort }, options);
}

/**
 * การจองของเครื่องนี้ที่ยังมีผล (ไม่ยกเลิก ไม่หมดอายุ ยังไม่รับเครื่อง) และทับช่วง [startAt, endAt)
 * ชนขอบพอดี (end = start) ไม่นับว่าทับ · ใช้ตอนจอง ยืมทันที และต่อเวลา
 * @param {number} notebookId
 * @param {Date} startAt
 * @param {Date} endAt
 * @param {{ excludeId?: number, conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<Reservation[]>} เรียงตาม startAt
 * @example
 * const clashes = await reservations.findOverlapping(notebookId, now, dueAt, { conn });
 */
export async function findOverlapping(notebookId, startAt, endAt, { excludeId, ...options } = {}) {
  return findMany(
    [
      ['r.notebook_id = ?', notebookId],
      [RESERVATION_IN_EFFECT_SQL],
      ['r.start_at < ? AND r.end_at > ?', endAt, startAt],
      excludeId !== undefined && ['r.id <> ?', excludeId],
    ],
    'ORDER BY r.start_at',
    options,
  );
}

/**
 * การจองที่ยังมีผล จะเริ่มภายใน X นาที (หรือเริ่มแล้วแต่ยังอยู่ในช่วงผ่อนผัน) และยังไม่เคยแจ้งเตือน
 * ให้ scheduled job ใช้
 * @param {number} withinMinutes
 * @param {Options} [options]
 * @returns {Promise<Reservation[]>}
 * @example
 * for (const r of await reservations.findStartingSoon(60)) { ... }
 */
export async function findStartingSoon(withinMinutes, options = {}) {
  return findMany(
    [
      [RESERVATION_IN_EFFECT_SQL],
      ['r.start_at <= NOW() + INTERVAL ? MINUTE', withinMinutes],
      [`NOT EXISTS (SELECT 1 FROM notifications nt WHERE nt.reservation_id = r.id AND nt.type = 'reservation_starting')`],
    ],
    'ORDER BY r.start_at',
    options,
  );
}

/**
 * @param {{ userId: number, notebookId: number, startAt: Date, endAt: Date }} data
 * @param {Options} [options]
 * @returns {Promise<Reservation>} ช่วงผิด (end ≤ start หรือ > 24 ชม.) → CHECK_FAILED (chk_res_period)
 * @example
 * const res = await reservations.insert({ userId, notebookId, startAt, endAt }, { conn });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, WRITABLE);
  const { insertId } = await execute(`INSERT INTO reservations ${sql}`, params, options);
  return findById(insertId, options);
}

/**
 * ยกเลิกการจอง guard: ยังไม่ยกเลิก และยังไม่รับเครื่อง
 * @param {number} id
 * @param {{ cancelledBy: number, reason?: string }} data cancelledBy = id ของผู้ยกเลิก (สมาชิกเองหรือแอดมิน)
 * @param {Options} [options]
 * @returns {Promise<Reservation|null>} null = ไม่พบ หรือยกเลิกไปแล้ว หรือรับเครื่องไปแล้ว
 * @example
 * const res = await reservations.cancel(10, { cancelledBy: userId, reason: 'ติดธุระ' });
 */
export async function cancel(id, { cancelledBy, reason = null }, options = {}) {
  const { affectedRows } = await execute(
    `UPDATE reservations r SET r.cancelled_at = NOW(), r.cancelled_by = ?, r.cancel_reason = ?
      WHERE r.id = ? AND r.cancelled_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.reservation_id = r.id)`,
    [cancelledBy, reason, id],
    options,
  );
  return affectedRows ? findById(id, options) : null;
}
