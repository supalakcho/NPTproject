# Backend – Model Layer (ระบบยืมคืนโน๊ตบุ๊ค)

ชั้นเดียวที่คุยกับฐานข้อมูล `notebook_loan` (MariaDB/MySQL) รายละเอียดฟังก์ชันทั้งหมดอยู่ใน `../Model Layer.md` และ JSDoc ของแต่ละไฟล์

## เริ่มใช้งาน

ต้องใช้ Node.js 20+ และ MariaDB ของ XAMPP ที่มีฐานข้อมูล `notebook_loan` อยู่แล้ว

```bash
cd backend
npm install
cp .env.example .env      # ค่าเริ่มต้นตรงกับ XAMPP (root ไม่มีรหัสผ่าน)
npm test
```

## การทดสอบ

- `npm test` สร้างฐาน `notebook_loan_test` ใหม่ก่อนทุกครั้ง (`scripts/create-test-db.js` คัดลอกตาราง, View และข้อมูลตั้งต้นจาก `notebook_loan` โดยอ่านอย่างเดียว) แล้วรันทุกไฟล์ใน `tests/`
- แต่ละ test ทำงานใน transaction แล้ว rollback ตอนจบ ข้อมูลในฐานทดสอบจึงสะอาดเสมอ
- รันไฟล์เดียว: `node --test tests/models/loans.test.js` (ต้องรัน `npm run test:setup-db` อย่างน้อยหนึ่งครั้งก่อน)
- test บางข้ออ้างอิงข้อมูลตั้งต้น (role admin/member, NB-0001…NB-0005, settings 5 ค่า) ถ้าแก้ข้อมูลตั้งต้นใน `notebook_loan` อาจต้องปรับ test ตาม

## การใช้งานจาก service

```js
import { withTransaction, notebooks, loans, DbError } from './src/models/index.js';

const loan = await withTransaction(async (conn) => {
  await notebooks.lockById(notebookId, { conn });
  return loans.insert({ userId, notebookId, borrowedAt: new Date(), dueAt }, { conn });
});
```

ข้อตกลงร่วม: parameter สุดท้ายคือ `options` (`{ conn?, includeDeleted? }`) · ไม่พบคืน `null` · `list` คืน `{ rows, total, page, pageSize }` · error จาก DB เป็น `DbError` (`code`, `constraint`) · ทุกฟังก์ชันคืน Promise

## จุดที่ต่างจากหรือเพิ่มจาก Model Layer.md

| เรื่อง | รายละเอียด |
| --- | --- |
| ฐานทดสอบ | ไม่มีไฟล์ `notebook_loan.sql` ใน repo จึงคัดลอกโครงสร้างจากฐาน `notebook_loan` ที่รันอยู่แทน |
| strict mode | ทุก connection ตั้ง `STRICT_ALL_TABLES` เพราะ XAMPP ค่าเริ่มต้นไม่ strict ค่าที่ยาวเกิน column จะถูกตัดทิ้งเงียบๆ ตอนนี้ได้ `DbError` code `DB_ERROR` แทน |
| `core/db.js` | เพิ่ม `queryPage()` ให้ทุก `list` ใช้ร่วมกัน (SELECT หน้าปัจจุบัน + COUNT) |
| `core/sqlBuilder.js` | เพิ่ม `buildWhere()` และ `likeParam()` (escape `%` `_` ใน keyword) |
| `loans.listWhere()` | export เพิ่มเพื่อให้ `reports.outstandingLoans` ใช้ SELECT เดียวกับ loans |
| options ที่มีค่าเพิ่ม | `isEmailTaken`, `findOverlapping`, `findAvailableInRange` รับ `excludeId`/`modelId` รวมใน object เดียวกับ `conn` เช่น `{ excludeId, conn }` |
