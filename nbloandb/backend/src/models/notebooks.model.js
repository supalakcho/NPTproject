// ตาราง notebooks: โน๊ตบุ๊คแต่ละเครื่อง (soft delete)
// currentStatus มาจาก View v_notebook_status (available / borrowed / reserved / damaged / maintenance / retired)
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildSet, buildWhere, buildOrderBy, buildPaging, likeParam } from './core/sqlBuilder.js';
import { RESERVATION_IN_EFFECT_SQL } from './reservations.model.js';

/**
 * @typedef {{ id: number, assetCode: string, serialNumber: string,
 *   conditionStatus: 'normal'|'damaged'|'maintenance'|'retired', conditionNote: string|null, purchasedAt: Date|null,
 *   currentStatus: 'available'|'borrowed'|'reserved'|'damaged'|'maintenance'|'retired'|null,
 *   modelId: number, modelName: string, brandId: number, brandName: string, cpu: string, ramGb: number,
 *   storageGb: number, screenInch: number, os: string, imagePath: string|null,
 *   createdAt: Date, updatedAt: Date, deletedAt: Date|null }} Notebook
 *   currentStatus เป็น null สำหรับเครื่องที่ถูกลบ (View ไม่รวมเครื่องที่ถูกลบ)
 */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection, includeDeleted?: boolean }} Options */

const WRITABLE = ['modelId', 'assetCode', 'serialNumber', 'conditionStatus', 'conditionNote', 'purchasedAt'];
const COLUMNS = `n.id, n.asset_code, n.serial_number, n.condition_status, n.condition_note, n.purchased_at,
  s.current_status, n.model_id, m.model_name, m.brand_id, b.name AS brand_name, m.cpu, m.ram_gb,
  m.storage_gb, m.screen_inch, m.os, m.image_path, n.created_at, n.updated_at, n.deleted_at`;
const FROM = `notebooks n
  JOIN notebook_models m ON m.id = n.model_id
  JOIN brands b ON b.id = m.brand_id
  LEFT JOIN v_notebook_status s ON s.id = n.id`;
const SORTABLE = {
  assetCode: 'n.asset_code',
  brandName: 'b.name',
  modelName: 'm.model_name',
  purchasedAt: 'n.purchased_at',
  createdAt: 'n.created_at',
};

const notDeleted = (options) => !options.includeDeleted && ['n.deleted_at IS NULL'];

async function findOne(condition, options) {
  const where = buildWhere([condition, notDeleted(options)]);
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} ${where.sql}`, where.params, options);
  return toCamel(rows[0]);
}

/**
 * รวมสเปกและสถานะปัจจุบัน
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<Notebook|null>}
 * @example
 * const nb = await notebooks.findById(1);
 */
export async function findById(id, options = {}) {
  return findOne(['n.id = ?', id], options);
}

/**
 * ใช้ตอนสแกน barcode
 * @param {string} assetCode
 * @param {Options} [options]
 * @returns {Promise<Notebook|null>}
 * @example
 * const nb = await notebooks.findByAssetCode('NB-0001');
 */
export async function findByAssetCode(assetCode, options = {}) {
  return findOne(['n.asset_code = ?', assetCode], options);
}

/**
 * เช็ค serial ซ้ำ
 * @param {string} serialNumber
 * @param {Options} [options]
 * @returns {Promise<Notebook|null>}
 * @example
 * const dup = await notebooks.findBySerialNumber('PF4ABC12', { includeDeleted: true });
 */
export async function findBySerialNumber(serialNumber, options = {}) {
  return findOne(['n.serial_number = ?', serialNumber], options);
}

/**
 * keyword ค้นใน รหัสครุภัณฑ์, serial, รุ่น, ยี่ห้อ
 * @param {{ keyword?: string, brandId?: number, modelId?: number, conditionStatus?: string, currentStatus?: string,
 *   page?: number, pageSize?: number, sort?: string }} [filter] sort ได้: assetCode, brandName, modelName, purchasedAt, createdAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: Notebook[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await notebooks.list({ currentStatus: 'available', sort: 'assetCode:asc' });
 */
export async function list(
  { keyword, brandId, modelId, conditionStatus, currentStatus, page, pageSize, sort } = {},
  options = {},
) {
  const like = keyword ? likeParam(keyword) : null;
  const result = await queryPage(
    {
      select: COLUMNS,
      from: FROM,
      where: buildWhere([
        like && ['n.asset_code LIKE ? OR n.serial_number LIKE ? OR m.model_name LIKE ? OR b.name LIKE ?', like, like, like, like],
        brandId !== undefined && ['m.brand_id = ?', brandId],
        modelId !== undefined && ['n.model_id = ?', modelId],
        conditionStatus !== undefined && ['n.condition_status = ?', conditionStatus],
        currentStatus !== undefined && ['s.current_status = ?', currentStatus],
        notDeleted(options),
      ]),
      orderBy: buildOrderBy(sort, SORTABLE, 'assetCode:asc'),
      paging: buildPaging(page, pageSize),
    },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows) };
}

/**
 * เครื่องสภาพปกติที่ไม่มีการยืม (ยังไม่รับคืน) หรือการจองที่ยังมีผลทับช่วง [startAt, endAt)
 * ใช้ในหน้าค้นหาเพื่อจอง · ชนขอบพอดีไม่นับว่าทับ
 * @param {Date} startAt
 * @param {Date} endAt
 * @param {{ modelId?: number, conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<Notebook[]>} เรียงตามรหัสครุภัณฑ์
 * @example
 * const free = await notebooks.findAvailableInRange(start, end, { modelId: 1 });
 */
export async function findAvailableInRange(startAt, endAt, { modelId, ...options } = {}) {
  const where = buildWhere([
    ["n.condition_status = 'normal'"],
    ['n.deleted_at IS NULL'],
    modelId !== undefined && ['n.model_id = ?', modelId],
    [
      `NOT EXISTS (SELECT 1 FROM loans l
         WHERE l.notebook_id = n.id AND l.returned_at IS NULL AND l.cancelled_at IS NULL
           AND l.borrowed_at < ? AND l.due_at > ?)`,
      endAt,
      startAt,
    ],
    [
      `NOT EXISTS (SELECT 1 FROM reservations r
         WHERE r.notebook_id = n.id AND ${RESERVATION_IN_EFFECT_SQL}
           AND r.start_at < ? AND r.end_at > ?)`,
      endAt,
      startAt,
    ],
  ]);
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} ${where.sql} ORDER BY n.asset_code`, where.params, options);
  return toCamelRows(rows);
}

/**
 * ให้ service เช็คก่อนลบหรือปลดระวางเครื่อง
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<{ activeLoans: number, upcomingReservations: number }>}
 *   activeLoans = ยังไม่รับคืนและไม่ถูกยกเลิก · upcomingReservations = การจองที่ยังมีผล (รอใช้ / ถึงเวลาใช้)
 * @example
 * const { activeLoans, upcomingReservations } = await notebooks.countOpenCommitments(1);
 */
export async function countOpenCommitments(id, options = {}) {
  const [row] = await query(
    `SELECT
       (SELECT COUNT(*) FROM loans l
         WHERE l.notebook_id = ? AND l.returned_at IS NULL AND l.cancelled_at IS NULL) AS active_loans,
       (SELECT COUNT(*) FROM reservations r
         WHERE r.notebook_id = ? AND ${RESERVATION_IN_EFFECT_SQL}) AS upcoming_reservations`,
    [id, id],
    options,
  );
  return { activeLoans: Number(row.active_loans), upcomingReservations: Number(row.upcoming_reservations) };
}

/**
 * @param {{ modelId: number, assetCode: string, serialNumber: string,
 *   conditionStatus?: 'normal'|'damaged'|'maintenance'|'retired', conditionNote?: string, purchasedAt?: Date }} data
 *   conditionStatus ค่าเริ่มต้น 'normal'
 * @param {Options} [options]
 * @returns {Promise<Notebook>} asset_code/serial ซ้ำ → DUPLICATE · modelId ไม่มีจริง → FK_NOT_FOUND
 * @example
 * await notebooks.insert({ modelId: 1, assetCode: 'NB-0100', serialNumber: 'SN100' });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, WRITABLE);
  const { insertId } = await execute(`INSERT INTO notebooks ${sql}`, params, options);
  return findById(insertId, options);
}

/**
 * @param {number} id
 * @param {Partial<{ modelId: number, assetCode: string, serialNumber: string, conditionStatus: string,
 *   conditionNote: string|null, purchasedAt: Date|null }>} data ส่งเฉพาะที่แก้
 * @param {Options} [options]
 * @returns {Promise<Notebook|null>}
 * @example
 * await notebooks.update(1, { serialNumber: 'NEW-SN' });
 */
export async function update(id, data, options = {}) {
  const { sql, params } = buildSet(data, WRITABLE);
  if (sql) {
    const where = buildWhere([['n.id = ?', id], notDeleted(options)]);
    const { affectedRows } = await execute(`UPDATE notebooks n SET ${sql} ${where.sql}`, [...params, ...where.params], options);
    if (!affectedRows) return null;
  }
  return findById(id, options);
}

/**
 * ใช้ตอนแอดมินรับคืนแล้วพบว่าเสียหาย หรือส่งซ่อม/ปลดระวาง
 * @param {number} id
 * @param {'normal'|'damaged'|'maintenance'|'retired'} conditionStatus
 * @param {string|null} [conditionNote]
 * @param {Options} [options]
 * @returns {Promise<Notebook|null>}
 * @example
 * await notebooks.updateCondition(loan.notebookId, 'damaged', 'จอแตกมุมขวา', { conn });
 */
export async function updateCondition(id, conditionStatus, conditionNote = null, options = {}) {
  return update(id, { conditionStatus, conditionNote }, options);
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * await notebooks.softDelete(5);
 */
export async function softDelete(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE notebooks SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
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
 * await notebooks.restore(5);
 */
export async function restore(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE notebooks SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL',
    [id],
    options,
  );
  return affectedRows > 0;
}

/**
 * SELECT … FOR UPDATE ล็อกแถวเครื่องจน transaction จบ ทำให้คำขอยืม/จองเครื่องเดียวกันต้องรอคิว
 * @param {number} id
 * @param {{ conn: import('mysql2/promise').PoolConnection }} options conn บังคับ (ต้องอยู่ใน withTransaction)
 * @returns {Promise<{ id: number, conditionStatus: string, deletedAt: Date|null }|null>}
 * @example
 * await withTransaction(async (conn) => {
 *   const nb = await notebooks.lockById(notebookId, { conn });
 * });
 */
export async function lockById(id, { conn } = {}) {
  if (!conn) throw new Error('notebooks.lockById requires options.conn from withTransaction');
  const rows = await query('SELECT id, condition_status, deleted_at FROM notebooks WHERE id = ? FOR UPDATE', [id], { conn });
  return toCamel(rows[0]);
}
