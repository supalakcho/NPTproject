// ตาราง loans: การยืม-คืน (ไม่มี update ทั่วไปและไม่มี delete แก้ได้เฉพาะผ่านฟังก์ชันเปลี่ยนสถานะ)
// loanStatus และ isLate มาจาก View v_loans: borrowing / overdue / return_pending / returned / cancelled
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildWhere, buildOrderBy, buildPaging } from './core/sqlBuilder.js';

/**
 * @typedef {{ id: number, userId: number, userFullName: string, notebookId: number, assetCode: string, modelName: string,
 *   reservationId: number|null, borrowedAt: Date, dueAt: Date, returnRequestedAt: Date|null, returnedAt: Date|null,
 *   receivedBy: number|null, returnCondition: 'normal'|'damaged'|null, returnNote: string|null,
 *   cancelledAt: Date|null, cancelledBy: number|null, cancelReason: string|null,
 *   loanStatus: 'borrowing'|'overdue'|'return_pending'|'returned'|'cancelled', isLate: boolean,
 *   createdAt: Date, updatedAt: Date }} Loan
 */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

const WRITABLE = ['userId', 'notebookId', 'borrowedAt', 'dueAt', 'reservationId'];
const CASTS = { isLate: 'bool' };
const COLUMNS = `l.id, l.user_id, CONCAT(u.first_name, ' ', u.last_name) AS user_full_name, l.notebook_id,
  n.asset_code, m.model_name, l.reservation_id, l.borrowed_at, l.due_at, l.return_requested_at, l.returned_at,
  l.received_by, l.return_condition, l.return_note, l.cancelled_at, l.cancelled_by, l.cancel_reason,
  l.loan_status, l.is_late, l.created_at, l.updated_at`;
const FROM = `v_loans l
  JOIN users u ON u.id = l.user_id
  JOIN notebooks n ON n.id = l.notebook_id
  JOIN notebook_models m ON m.id = n.model_id`;
const SORTABLE = { borrowedAt: 'l.borrowed_at', dueAt: 'l.due_at' };

// guard ของคำสั่งเปลี่ยนสถานะ
const OPEN = 'returned_at IS NULL AND cancelled_at IS NULL';
const NOT_REQUESTED = 'return_requested_at IS NULL';

async function findMany(conditions, orderBy, options) {
  const where = buildWhere(conditions);
  return toCamelRows(await query(`SELECT ${COLUMNS} FROM ${FROM} ${where.sql} ${orderBy}`, where.params, options), CASTS);
}

/**
 * ค้นหาแบบแบ่งหน้าด้วยเงื่อนไขและลำดับที่กำหนดเอง (ใช้ร่วมกับ reports.model.js)
 * @param {{ conditions: Array<[string, ...unknown[]]|false|null|undefined>, orderBy: string, page?: number, pageSize?: number }} parts
 * @param {Options} [options]
 * @returns {Promise<{ rows: Loan[], total: number, page: number, pageSize: number }>}
 * @example
 * await listWhere({ conditions: [["l.loan_status = 'overdue'"]], orderBy: 'ORDER BY l.due_at' });
 */
export async function listWhere({ conditions, orderBy, page, pageSize }, options = {}) {
  const result = await queryPage(
    { select: COLUMNS, from: FROM, where: buildWhere(conditions), orderBy, paging: buildPaging(page, pageSize) },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows, CASTS) };
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<Loan|null>}
 * @example
 * const loan = await loans.findById(7);
 */
export async function findById(id, options = {}) {
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE l.id = ?`, [id], options);
  return toCamel(rows[0], CASTS);
}

/**
 * สำหรับแอดมิน · from/to กรองตาม borrowedAt (รวมขอบ)
 * @param {{ userId?: number, notebookId?: number, status?: Loan['loanStatus'], isLate?: boolean, from?: Date, to?: Date,
 *   page?: number, pageSize?: number, sort?: string }} [filter] sort ได้: borrowedAt, dueAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: Loan[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await loans.list({ status: 'overdue', sort: 'dueAt:asc' });
 */
export async function list({ userId, notebookId, status, isLate, from, to, page, pageSize, sort } = {}, options = {}) {
  return listWhere(
    {
      conditions: [
        userId !== undefined && ['l.user_id = ?', userId],
        notebookId !== undefined && ['l.notebook_id = ?', notebookId],
        status !== undefined && ['l.loan_status = ?', status],
        isLate !== undefined && ['l.is_late = ?', isLate],
        from !== undefined && ['l.borrowed_at >= ?', from],
        to !== undefined && ['l.borrowed_at <= ?', to],
      ],
      orderBy: buildOrderBy(sort, SORTABLE, 'borrowedAt:desc'),
      page,
      pageSize,
    },
    options,
  );
}

/**
 * ประวัติการยืมของสมาชิก
 * @param {number} userId
 * @param {{ status?: Loan['loanStatus'], page?: number, pageSize?: number, sort?: string }} [filter] sort ได้: borrowedAt, dueAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: Loan[], total: number, page: number, pageSize: number }>}
 * @example
 * const mine = await loans.listByUser(userId, { status: 'returned' });
 */
export async function listByUser(userId, { status, page, pageSize, sort } = {}, options = {}) {
  return list({ userId, status, page, pageSize, sort }, options);
}

/**
 * รายการที่สมาชิกกดคืนแล้ว รอแอดมินยืนยัน เรียงจากกดคืนก่อน
 * @param {{ page?: number, pageSize?: number }} [filter]
 * @param {Options} [options]
 * @returns {Promise<{ rows: Loan[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await loans.listPendingReturn();
 */
export async function listPendingReturn({ page, pageSize } = {}, options = {}) {
  return listWhere(
    {
      conditions: [["l.loan_status = 'return_pending'"]],
      orderBy: 'ORDER BY l.return_requested_at ASC, l.id ASC',
      page,
      pageSize,
    },
    options,
  );
}

/**
 * การยืมที่ยังไม่ได้รับคืนของเครื่องนี้ (รวมที่กดคืนแล้วแต่แอดมินยังไม่ยืนยัน)
 * @param {number} notebookId
 * @param {Options} [options]
 * @returns {Promise<Loan|null>}
 * @example
 * const current = await loans.findActiveByNotebook(nb.id);
 */
export async function findActiveByNotebook(notebookId, options = {}) {
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} WHERE l.active_notebook_id = ?`, [notebookId], options);
  return toCamel(rows[0], CASTS);
}

/**
 * จำนวนเครื่องที่สมาชิกยังไม่ได้คืน (ยังไม่รับคืนและไม่ถูกยกเลิก) ให้ service เทียบกับ max_active_loans_per_user
 * @param {number} userId
 * @param {Options} [options]
 * @returns {Promise<number>}
 * @example
 * const active = await loans.countActiveByUser(userId, { conn });
 */
export async function countActiveByUser(userId, options = {}) {
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM loans WHERE user_id = ? AND ${OPEN}`, [userId], options);
  return Number(total);
}

/**
 * การยืมที่ยังไม่ได้รับคืนซึ่งช่วง [borrowedAt, dueAt) ทับช่วงที่ให้มา ชนขอบพอดีไม่นับ · ใช้ตอนสร้างการจอง
 * @param {number} notebookId
 * @param {Date} startAt
 * @param {Date} endAt
 * @param {{ excludeId?: number, conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<Loan[]>}
 * @example
 * const clashes = await loans.findOverlapping(notebookId, startAt, endAt, { conn });
 */
export async function findOverlapping(notebookId, startAt, endAt, { excludeId, ...options } = {}) {
  return findMany(
    [
      ['l.notebook_id = ?', notebookId],
      ['l.returned_at IS NULL AND l.cancelled_at IS NULL'],
      ['l.borrowed_at < ? AND l.due_at > ?', endAt, startAt],
      excludeId !== undefined && ['l.id <> ?', excludeId],
    ],
    'ORDER BY l.borrowed_at',
    options,
  );
}

/**
 * ยังไม่กดคืน ครบกำหนดภายใน X นาที และยังไม่มีแจ้งเตือน loan_due_soon สำหรับ dueAt นี้
 * (ต่อเวลาแล้ว dueAt เปลี่ยน จึงแจ้งเตือนรอบใหม่ได้)
 * @param {number} withinMinutes
 * @param {Options} [options]
 * @returns {Promise<Loan[]>}
 * @example
 * for (const loan of await loans.findDueSoon(60)) { ... }
 */
export async function findDueSoon(withinMinutes, options = {}) {
  return findMany(
    [
      ["l.loan_status = 'borrowing'"],
      ['l.due_at <= NOW() + INTERVAL ? MINUTE', withinMinutes],
      [`NOT EXISTS (SELECT 1 FROM notifications nt
          WHERE nt.loan_id = l.id AND nt.type = 'loan_due_soon' AND nt.ref_due_at = l.due_at)`],
    ],
    'ORDER BY l.due_at',
    options,
  );
}

/**
 * เกินกำหนด ยังไม่กดคืน และยังไม่มีแจ้งเตือน loan_overdue สำหรับ dueAt นี้
 * @param {Options} [options]
 * @returns {Promise<Loan[]>}
 * @example
 * for (const loan of await loans.findOverdueWithoutNotice()) { ... }
 */
export async function findOverdueWithoutNotice(options = {}) {
  return findMany(
    [
      ["l.loan_status = 'overdue'"],
      [`NOT EXISTS (SELECT 1 FROM notifications nt
          WHERE nt.loan_id = l.id AND nt.type = 'loan_overdue' AND nt.ref_due_at = l.due_at)`],
    ],
    'ORDER BY l.due_at',
    options,
  );
}

/**
 * @param {{ userId: number, notebookId: number, borrowedAt: Date, dueAt: Date, reservationId?: number }} data
 * @param {Options} [options]
 * @returns {Promise<Loan>} เครื่องถูกยืมอยู่ → DUPLICATE (uq_loans_active_notebook) · เกิน 24 ชม. → CHECK_FAILED
 *   · reservation ไม่ตรงผู้ยืม/เครื่อง → FK_NOT_FOUND
 * @example
 * const loan = await loans.insert({ userId, notebookId, borrowedAt: now, dueAt }, { conn });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, WRITABLE);
  const { insertId } = await execute(`INSERT INTO loans ${sql}`, params, options);
  return findById(insertId, options);
}

async function guardedUpdate(id, setSql, setParams, guardSql, options) {
  const { affectedRows } = await execute(
    `UPDATE loans SET ${setSql} WHERE id = ? AND ${guardSql}`,
    [...setParams, id],
    options,
  );
  return affectedRows ? findById(id, options) : null;
}

/**
 * ต่อเวลา guard: ยังไม่กดคืน ยังไม่รับคืน ไม่ถูกยกเลิก
 * @param {number} id
 * @param {Date} newDueAt
 * @param {Options} [options]
 * @returns {Promise<Loan|null>} null = ไม่พบหรือสถานะไม่ตรง · รวมเกิน 24 ชม. → CHECK_FAILED
 * @example
 * await loans.extendDueAt(loanId, newDueAt, { conn });
 */
export async function extendDueAt(id, newDueAt, options = {}) {
  return guardedUpdate(id, 'due_at = ?', [newDueAt], `${OPEN} AND ${NOT_REQUESTED}`, options);
}

/**
 * สมาชิกกดคืน guard: ยังไม่กดคืน ยังไม่รับคืน ไม่ถูกยกเลิก
 * @param {number} id
 * @param {{ at?: Date }} [data] at ค่าเริ่มต้น = ตอนนี้
 * @param {Options} [options]
 * @returns {Promise<Loan|null>} null = ไม่พบหรือกดคืนไปแล้ว
 * @example
 * await loans.requestReturn(loanId);
 */
export async function requestReturn(id, { at = new Date() } = {}, options = {}) {
  return guardedUpdate(id, 'return_requested_at = ?', [at], `${OPEN} AND ${NOT_REQUESTED}`, options);
}

/**
 * แอดมินยืนยันรับเครื่อง guard: ยังไม่รับคืน ไม่ถูกยกเลิก (รับคืนได้แม้สมาชิกไม่ได้กดคืน)
 * @param {number} id
 * @param {{ receivedBy: number, returnCondition: 'normal'|'damaged', returnNote?: string, at?: Date }} data
 * @param {Options} [options]
 * @returns {Promise<Loan|null>}
 * @example
 * await loans.confirmReturn(loanId, { receivedBy: adminId, returnCondition: 'normal' });
 */
export async function confirmReturn(id, { receivedBy, returnCondition, returnNote = null, at = new Date() }, options = {}) {
  return guardedUpdate(
    id,
    'returned_at = ?, received_by = ?, return_condition = ?, return_note = ?',
    [at, receivedBy, returnCondition, returnNote],
    OPEN,
    options,
  );
}

/**
 * แอดมินยกเลิกรายการยืม guard: ยังไม่รับคืน ไม่ถูกยกเลิก
 * @param {number} id
 * @param {{ cancelledBy: number, reason?: string }} data
 * @param {Options} [options]
 * @returns {Promise<Loan|null>}
 * @example
 * await loans.cancel(loanId, { cancelledBy: adminId, reason: 'บันทึกผิด' });
 */
export async function cancel(id, { cancelledBy, reason = null }, options = {}) {
  return guardedUpdate(id, 'cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ?', [cancelledBy, reason], OPEN, options);
}
