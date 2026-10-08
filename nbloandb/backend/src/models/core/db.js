// รัน SQL แบบ prepared statement และจัดการ transaction
import { pool } from '../../config/database.js';
import { DbError } from './DbError.js';

/**
 * รัน SELECT แบบ prepared statement
 * @param {string} sql
 * @param {Array<unknown>} [params]
 * @param {{ conn?: import('mysql2/promise').PoolConnection }} [options] ส่ง conn เมื่ออยู่ใน transaction
 * @returns {Promise<Array<Record<string, unknown>>>} rows ตามที่ DB คืน (ยังเป็น snake_case)
 * @example
 * const rows = await query('SELECT * FROM roles WHERE id = ?', [1]);
 */
export async function query(sql, params = [], { conn } = {}) {
  try {
    const [rows] = await (conn ?? pool).execute(sql, params);
    return rows;
  } catch (err) {
    throw DbError.from(err);
  }
}

/**
 * รัน INSERT / UPDATE / DELETE แบบ prepared statement
 * affectedRows นับแถวที่ตรง WHERE (mysql2 เปิด FOUND_ROWS) ไม่ใช่เฉพาะแถวที่ค่าเปลี่ยน
 * @param {string} sql
 * @param {Array<unknown>} [params]
 * @param {{ conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<{ insertId: number, affectedRows: number }>}
 * @example
 * const { insertId } = await execute('INSERT INTO brands (name) VALUES (?)', ['HP']);
 */
export async function execute(sql, params = [], { conn } = {}) {
  try {
    const [result] = await (conn ?? pool).execute(sql, params);
    return { insertId: result.insertId, affectedRows: result.affectedRows };
  } catch (err) {
    throw DbError.from(err);
  }
}

/**
 * เปิด transaction, commit เมื่อ work สำเร็จ, rollback เมื่อ throw แล้ว throw ต่อ
 * คืน connection ให้ pool เสมอ
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} work
 * @returns {Promise<T>} ค่าที่ work คืน
 * @example
 * const loan = await withTransaction(async (conn) => {
 *   await notebooks.lockById(notebookId, { conn });
 *   return loans.insert({ userId, notebookId, borrowedAt, dueAt }, { conn });
 * });
 */
export async function withTransaction(work) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
  } catch (err) {
    conn?.release();
    throw DbError.from(err);
  }
  try {
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * ดึงข้อมูลแบบแบ่งหน้า: รัน SELECT หน้าปัจจุบันกับ COUNT(*) ด้วยเงื่อนไขเดียวกัน
 * @param {{ select: string, from: string, where: { sql: string, params: unknown[] },
 *           orderBy: string, paging: { sql: string, params: number[], page: number, pageSize: number } }} parts
 * @param {{ conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<{ rows: Array<Record<string, unknown>>, total: number, page: number, pageSize: number }>}
 *   rows ยังเป็น snake_case ให้ model แปลงต่อ
 * @example
 * const page = await queryPage({ select: 'b.*', from: 'brands b', where: buildWhere([]),
 *   orderBy: 'ORDER BY b.name ASC', paging: buildPaging(1, 20) });
 */
export async function queryPage({ select, from, where, orderBy, paging }, options = {}) {
  const rows = await query(
    `SELECT ${select} FROM ${from} ${where.sql} ${orderBy} ${paging.sql}`,
    [...where.params, ...paging.params],
    options,
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM ${from} ${where.sql}`, where.params, options);
  return { rows, total: Number(total), page: paging.page, pageSize: paging.pageSize };
}
