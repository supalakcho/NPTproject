// สร้าง connection pool ครั้งเดียวทั้งแอป
import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME,
  connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 10),
  timezone: '+07:00', // แปลง DATETIME ⇄ JS Date เป็นเวลาไทย
  decimalNumbers: true, // DECIMAL → Number
  charset: 'utf8mb4',
});

// ทุก connection: NOW() ฝั่ง DB เป็นเวลาไทยเสมอ และเปิด strict mode
// (XAMPP ค่าเริ่มต้นไม่ strict ทำให้ค่าที่ยาวเกิน column ถูกตัดทิ้งเงียบๆ แทนที่จะ error)
pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+07:00', sql_mode = CONCAT_WS(',', @@sql_mode, 'STRICT_ALL_TABLES')");
});

/** ปิด pool ตอนปิดแอปหรือจบ test */
export function closePool() {
  return pool.end();
}
