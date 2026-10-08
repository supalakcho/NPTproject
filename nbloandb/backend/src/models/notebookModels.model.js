// ตาราง notebook_models: รุ่นและสเปกโน๊ตบุ๊ค (soft delete)
import { query, execute, queryPage } from './core/db.js';
import { toCamel, toCamelRows } from './core/mapper.js';
import { buildInsert, buildSet, buildWhere, buildOrderBy, buildPaging, likeParam } from './core/sqlBuilder.js';

/**
 * @typedef {{ id: number, brandId: number, brandName: string, modelName: string, cpu: string, ramGb: number,
 *   storageGb: number, screenInch: number, os: string, imagePath: string|null,
 *   createdAt: Date, updatedAt: Date, deletedAt: Date|null }} NotebookModel
 */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection, includeDeleted?: boolean }} Options */

const WRITABLE = ['brandId', 'modelName', 'cpu', 'ramGb', 'storageGb', 'screenInch', 'os', 'imagePath'];
const COLUMNS = `m.id, m.brand_id, b.name AS brand_name, m.model_name, m.cpu, m.ram_gb, m.storage_gb,
  m.screen_inch, m.os, m.image_path, m.created_at, m.updated_at, m.deleted_at`;
const FROM = 'notebook_models m JOIN brands b ON b.id = m.brand_id';
const SORTABLE = { modelName: 'm.model_name', brandName: 'b.name', ramGb: 'm.ram_gb', createdAt: 'm.created_at' };

const notDeleted = (options) => !options.includeDeleted && ['m.deleted_at IS NULL'];

async function findOne(conditions, options) {
  const where = buildWhere([...conditions, notDeleted(options)]);
  const rows = await query(`SELECT ${COLUMNS} FROM ${FROM} ${where.sql}`, where.params, options);
  return toCamel(rows[0]);
}

/**
 * join ชื่อยี่ห้อมาให้
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<NotebookModel|null>}
 * @example
 * const model = await notebookModels.findById(1);
 */
export async function findById(id, options = {}) {
  return findOne([['m.id = ?', id]], options);
}

/**
 * เช็ครุ่นซ้ำในยี่ห้อเดียวกัน
 * @param {number} brandId
 * @param {string} modelName
 * @param {Options} [options]
 * @returns {Promise<NotebookModel|null>}
 * @example
 * const dup = await notebookModels.findByBrandAndName(1, 'ThinkPad E14 Gen 5', { includeDeleted: true });
 */
export async function findByBrandAndName(brandId, modelName, options = {}) {
  return findOne([['m.brand_id = ?', brandId], ['m.model_name = ?', modelName]], options);
}

/**
 * keyword ค้นใน ชื่อรุ่น, CPU
 * @param {{ brandId?: number, keyword?: string, page?: number, pageSize?: number, sort?: string }} [filter]
 *   sort ได้: modelName, brandName, ramGb, createdAt
 * @param {Options} [options]
 * @returns {Promise<{ rows: NotebookModel[], total: number, page: number, pageSize: number }>}
 * @example
 * const { rows } = await notebookModels.list({ brandId: 1, sort: 'ramGb:desc' });
 */
export async function list({ brandId, keyword, page, pageSize, sort } = {}, options = {}) {
  const like = keyword ? likeParam(keyword) : null;
  const result = await queryPage(
    {
      select: COLUMNS,
      from: FROM,
      where: buildWhere([
        brandId !== undefined && ['m.brand_id = ?', brandId],
        like && ['m.model_name LIKE ? OR m.cpu LIKE ?', like, like],
        notDeleted(options),
      ]),
      orderBy: buildOrderBy(sort, SORTABLE, 'modelName:asc'),
      paging: buildPaging(page, pageSize),
    },
    options,
  );
  return { ...result, rows: toCamelRows(result.rows) };
}

/**
 * @param {{ brandId: number, modelName: string, cpu: string, ramGb: number, storageGb: number,
 *   screenInch: number, os: string, imagePath?: string }} data
 * @param {Options} [options]
 * @returns {Promise<NotebookModel>} สเปกนอกช่วง (เช่น ramGb > 256) → CHECK_FAILED · รุ่นซ้ำในยี่ห้อ → DUPLICATE
 * @example
 * await notebookModels.insert({ brandId: 1, modelName: 'X1', cpu: 'i7', ramGb: 16, storageGb: 512, screenInch: 14, os: 'Windows 11' });
 */
export async function insert(data, options = {}) {
  const { sql, params } = buildInsert(data, WRITABLE);
  const { insertId } = await execute(`INSERT INTO notebook_models ${sql}`, params, options);
  return findById(insertId, options);
}

/**
 * @param {number} id
 * @param {Partial<{ brandId: number, modelName: string, cpu: string, ramGb: number, storageGb: number,
 *   screenInch: number, os: string, imagePath: string|null }>} data ส่งเฉพาะที่แก้
 * @param {Options} [options]
 * @returns {Promise<NotebookModel|null>}
 * @example
 * await notebookModels.update(1, { ramGb: 32 });
 */
export async function update(id, data, options = {}) {
  const { sql, params } = buildSet(data, WRITABLE);
  if (sql) {
    const where = buildWhere([['m.id = ?', id], notDeleted(options)]);
    const { affectedRows } = await execute(`UPDATE notebook_models m SET ${sql} ${where.sql}`, [...params, ...where.params], options);
    if (!affectedRows) return null;
  }
  return findById(id, options);
}

/**
 * @param {number} id
 * @param {Options} [options]
 * @returns {Promise<boolean>}
 * @example
 * await notebookModels.softDelete(3);
 */
export async function softDelete(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE notebook_models SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
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
 * await notebookModels.restore(3);
 */
export async function restore(id, options = {}) {
  const { affectedRows } = await execute(
    'UPDATE notebook_models SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL',
    [id],
    options,
  );
  return affectedRows > 0;
}

/**
 * จำนวนเครื่องที่ยังไม่ถูกลบของรุ่นนี้ ให้ service เช็คก่อนลบรุ่น
 * @param {number} modelId
 * @param {Options} [options]
 * @returns {Promise<number>}
 * @example
 * await notebookModels.countActiveNotebooks(1);
 */
export async function countActiveNotebooks(modelId, options = {}) {
  const [{ total }] = await query(
    'SELECT COUNT(*) AS total FROM notebooks WHERE model_id = ? AND deleted_at IS NULL',
    [modelId],
    options,
  );
  return Number(total);
}
