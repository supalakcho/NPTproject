// สร้างฐานข้อมูลทดสอบ (DB_TEST_NAME) ใหม่ทุกครั้งโดยคัดลอกโครงสร้าง View และข้อมูลตั้งต้นจาก DB_NAME
// รันอัตโนมัติก่อน `npm test` (pretest) อ่านจากฐานจริงอย่างเดียว ไม่แก้ไขฐานจริง
import 'dotenv/config';
import mysql from 'mysql2/promise';

const source = process.env.DB_NAME;
const target = process.env.DB_TEST_NAME;
if (!source || !target || source === target) {
  throw new Error('DB_NAME and DB_TEST_NAME must be set and different');
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  charset: 'utf8mb4',
  multipleStatements: false,
});
const id = (name) => `\`${name.replaceAll('`', '``')}\``;

try {
  const [objects] = await conn.query(
    'SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [source],
  );
  const tables = objects.filter((o) => o.type === 'BASE TABLE').map((o) => o.name);
  const views = objects.filter((o) => o.type === 'VIEW').map((o) => o.name);

  await conn.query(`DROP DATABASE IF EXISTS ${id(target)}`);
  await conn.query(`CREATE DATABASE ${id(target)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const table of tables) {
    const [[row]] = await conn.query(`SHOW CREATE TABLE ${id(source)}.${id(table)}`);
    await conn.query(`USE ${id(target)}`);
    await conn.query(row['Create Table']);

    // ข้าม generated column (เช่น loans.active_notebook_id) เพราะ INSERT ค่าเองไม่ได้
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA NOT LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION`,
      [source, table],
    );
    const list = cols.map((c) => id(c.name)).join(', ');
    await conn.query(`INSERT INTO ${id(target)}.${id(table)} (${list}) SELECT ${list} FROM ${id(source)}.${id(table)}`);
  }

  for (const view of views) {
    await conn.query(`USE ${id(source)}`);
    const [[row]] = await conn.query(`SHOW CREATE VIEW ${id(view)}`);
    await conn.query(`USE ${id(target)}`);
    await conn.query(row['Create View']);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`Test database "${target}" created from "${source}" (${tables.length} tables, ${views.length} views)`);
} finally {
  await conn.end();
}
