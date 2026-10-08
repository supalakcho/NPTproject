// ต้อง import ก่อน config/database.js: ชี้ pool ไปที่ฐานข้อมูลทดสอบ ไม่ใช่ฐานจริง
import 'dotenv/config';

if (!process.env.DB_TEST_NAME || process.env.DB_TEST_NAME === process.env.DB_NAME) {
  throw new Error('DB_TEST_NAME must be set and different from DB_NAME');
}
process.env.DB_NAME = process.env.DB_TEST_NAME;
