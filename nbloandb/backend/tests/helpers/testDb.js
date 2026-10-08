// เชื่อมฐานข้อมูลทดสอบ + rollback หลังแต่ละ test ข้อมูลจึงสะอาดทุกครั้ง
import './testEnv.js';
import { pool, closePool } from '../../src/config/database.js';

export { pool, closePool };

/**
 * รัน fn ใน transaction แล้ว rollback เสมอ ส่ง conn ให้ทุกฟังก์ชันของ model ผ่าน { conn }
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withRollback(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    return await fn(conn);
  } finally {
    await conn.rollback();
    conn.release();
  }
}

/** test(name, rollbackTest(async (conn) => { ... })) */
export const rollbackTest = (fn) => () => withRollback(fn);

let seq = 0;
/** ค่าไม่ซ้ำสำหรับ field ที่เป็น UNIQUE */
export function unique(prefix) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
/** เวลาเทียบกับตอนนี้ ตัดมิลลิวินาทีทิ้ง (DATETIME ไม่เก็บเศษวินาที) */
export function fromNow(ms) {
  const d = new Date(Date.now() + ms);
  d.setMilliseconds(0);
  return d;
}
