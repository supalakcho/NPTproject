// ตาราง brands: ยี่ห้อโน๊ตบุ๊ค (soft delete)
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildSet, buildWhere, buildOrderBy, buildPaging, likeParam } from './core/sqlBuilder.js';

/** @typedef {{ id: number, name: string, createdAt: Date, updatedAt: Date, deletedAt: Date|null }} Brand */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection, includeDeleted?: boolean }} Options */

const WRITABLE = ['name'];
const COLUMNS = 'b.id, b.name, b.created_at, b.updated_at, b.deleted_at';
const SORTABLE = { name: 'b.name', createdAt: 'b.created_at' };

const notDeleted = (options) => !options.includeDeleted && ['b.deleted_at IS NULL'];

async function findOne(condition, options) {
  const where = buildWhere([condition, notDeleted(options)]);
  const rows = await query(`SELECT ${COLUMNS} FROM brands b ${where.sql}`, where.params, options);
  return toCamel(rows[0]);
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<Brand|null>}
 * @example
 * const brand = await brands.findById(1);
 */
export async function findById(id, options = {}) {
  return findOne(['b.id = ?', id], options);
}

/**
 * หาโดยชื่อ ไม่สนตัวพิมพ์เล็ก-ใหญ่ (collation ของตารางเป็น _ci) ใช้เช็คชื่อซ้ำ
 * @param {string} name
 * @param {Options} [options] ส่ง includeDeleted: true เพื่อรวมยี่ห้อที่ถูกลบ (ชื่อยัง UNIQUE อยู่)
 * @returns {Promise<Brand|null>}
 * @example
 * const exists = await brands.findByName('lenovo', { includeDeleted: true });
 */
export async function findByName(name, options = {}) {
  return findOne(['b.name = ?', name], options);
}

/**
 * ทุกยี่ห้อสำหรับ dropdown เรียงตามชื่อ
 * @param {Options} [options]
 * @returns {Promise<Brand[]>}
 * @example
 * const all = await brands.findAll();
 */
export async function findAll(options = {}) {
  const where = buildWhere([notDeleted(options)]);
  return toCamelRows(await query(`SELECT ${COLUMNS} FROM brands b ${where.sql} ORDER BY b.name`, where.params, options));
}

/**
 * @param {{ keyword?: string, page?: number, pageSize?: number, sort?: string }} [filter] sort ได้: name, createdAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: Brand[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows, total } = await brands.list({ keyword: 'len', sort: 'name:asc' });
 */
export async function list({ keyword, page, pageSize, sort } = {}, options = {}) {
  const result = await queryPage(
    {
      select: COLUMNS,
      from: 'brands b',
      where: buildWhere([keyword && ['b.name LIKE ?', likeParam(keyword)], notDeleted(options)]),
      orderBy: buildOrderBy(sort, SORTABLE, 'name:asc'),
      paging: buildPaging(page, pageSize),
    },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows) };
}

/**
 * @param {{ name: string }} data
 * @param {Options} [options]
 * @returns {Promise<Brand>} ชื่อซ้ำ (รวมที่ถูกลบ) → DbError DUPLICATE (uq_brands_name)
 * @example
 * const hp = await brands.insert({ name: 'HP' });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, WRITABLE);
  const { insertId } = await execute(`INSERT INTO brands ${sql}`, params, options);
  return findById(insertId, options);
}

/**
 * แก้ได้เฉพาะยี่ห้อที่ยังไม่ถูกลบ (เว้นแต่ includeDeleted: true)
 * @param {number} id
 * @param {{ name?: string }} data
 * @param {Options} [options]
 * @returns {Promise<Brand|null>} null = ไม่พบ
 * @example
 * await brands.update(4, { name: 'HP Inc.' });
 */
export async function update(id, data, options = {}) {
  const { sql, params } = buildSet(data, WRITABLE);
  if (sql) {
    const where = buildWhere([['b.id = ?', id], notDeleted(options)]);
    const { affectedRows } = await execute(`UPDATE brands b SET ${sql} ${where.sql}`, [...params, ...where.params], options);
    if (!affectedRows) return null;
  }
  return findById(id, options);
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>} false = ไม่พบหรือถูกลบไปแล้ว
 * @example
 * await brands.softDelete(4);
 */
export async function softDelete(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE brands SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [id],
    options,
  );
  return affectedRows > 0;
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>} false = ไม่พบหรือไม่ได้ถูกลบ
 * @example
 * await brands.restore(4);
 */
export async function restore(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE brands SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL',
    [id],
    options,
  );
  return affectedRows > 0;
}

/**
 * จำนวนรุ่นที่ยังไม่ถูกลบของยี่ห้อนี้ ให้ service เช็คก่อนลบยี่ห้อ
 * @param {number} brandId
 * @param {Options} [options]
 * @returns {Promise<number>}
 * @example
 * if (await brands.countActiveModels(1) > 0) { ... }
 */
export async function countActiveModels(brandId, options = {}) {
  const [{ total }] = await query(
    'SELECT COUNT(*) AS total FROM notebook_models WHERE brand_id = ? AND deleted_at IS NULL',
    [brandId],
    options,
  );
  return Number(total);
}
