# Backend – ระบบยืมคืนโน๊ตบุ๊ค

Node.js (ES Modules) + Express 5 + MariaDB/MySQL แบ่งเป็น 3 ชั้น

```text
HTTP ──► routes ► middlewares ► controllers ──► services ──► models ──► MariaDB
         (http-api-spec.md)                    (business-logic-plan.md)  (Model Layer.md)
```

## เริ่มใช้งาน

ต้องใช้ Node.js 20+ และ MariaDB ของ XAMPP ที่ import `../notebook_loan.sql` แล้ว (สร้างฐาน `notebook_loan` พร้อมข้อมูลตั้งต้น)

```bash
cd backend
npm install
cp .env.example .env      # ค่าเริ่มต้นตรงกับ XAMPP · เปลี่ยน JWT_SECRET เป็นค่าสุ่มอย่างน้อย 32 ตัวอักษร
npm start                 # http://localhost:3000/api/v1  (npm run dev = restart อัตโนมัติเมื่อแก้โค้ด)
npm test
```

บัญชีตัวอย่างจาก SQL: `admin@example.com` / `Admin@1234` · `member@example.com` / `Member@1234`

| ตัวแปร .env | ค่าเริ่มต้น | ใช้ทำอะไร |
| --- | --- | --- |
| DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_POOL_LIMIT | XAMPP | เชื่อมฐานข้อมูล |
| DB_TEST_NAME | notebook_loan_test | ฐานทดสอบ (ต้องต่างจาก DB_NAME) |
| JWT_SECRET | – (บังคับ ≥ 32 ตัว) | เซ็น token ห้าม commit ค่าจริง |
| JWT_EXPIRES_IN | 8h | อายุ token |
| BCRYPT_ROUNDS | 10 | ความยากของ hash รหัสผ่าน |
| LOG_DIR | ./logs | log ไฟล์ `app-YYYY-MM-DD.log` |
| JOBS_ENABLED | true | `false` = ปิด scheduled job |
| PORT | 3000 | port ของ API |
| UPLOAD_DIR | ./uploads | ไฟล์รูป เปิดได้ที่ `/uploads/...` |

## โครงสร้างโฟลเดอร์

```text
src/
├─ server.js                 เปิด server + scheduler (npm start)
├─ app.js                    สร้าง Express app (test เรียกได้โดยไม่เปิด port จริง)
├─ config/database.js        connection pool
├─ routes/                   path ทั้งหมดตาม http-api-spec ข้อ 2 (comment ระบุรหัส A1, L3, ...)
├─ middlewares/              authenticate (Bearer → req.ctx), errorHandler, upload (รูป ≤ 2 MB)
├─ controllers/              แปลง req → service แล้วตอบ { success, data, meta } · respond.js = ตัวช่วยร่วม
├─ services/                 กฎธุรกิจทั้งหมด ทุกฟังก์ชันรับ (ctx, input)
│  ├─ core/                  AppError, errorCodes, dbErrorMapper, authorize, audit, clock, logger,
│  │                         token, password, dto, settingsCache, reservationRules, notificationText
│  ├─ validators/            rules.js + schema ของแต่ละกลุ่ม
│  ├─ *.service.js           auth, profile, brands, notebookModels, notebooks, loans, reservations,
│  │                         notifications, users, settings, auditLogs, reports
│  └─ index.js               export ทุก service (ห่อให้ error ทุกชนิดออกมาเป็น AppError)
├─ jobs/                     notification.job.js (สร้างแจ้งเตือน) + scheduler.js (ทุก 5 นาที)
└─ models/                   ชั้นเดียวที่เขียน SQL
tests/
├─ models/                   test ของ model (rollback ทุก test)
├─ services/                 test ของ service ตามข้อ 7 ของ business-logic-plan
├─ http/                     test HTTP จริงผ่าน fetch
└─ helpers/
```

## การใช้ service

```js
import { loans, AppError } from './src/services/index.js';

// ctx มาจาก middleware authenticate: { userId, roleId, roleCode, permissions: Set, ip, userAgent }
const loan = await loans.borrowNow(ctx, { notebookId: 7, dueAt: '2026-10-08T17:00:00+07:00' });
```

ข้อตกลงร่วม: ตรวจสิทธิ์ก่อน แล้วค่อย validate · ไม่สำเร็จ throw `AppError` (`code`, `status`, `message` ภาษาไทย, `details`) เสมอ · ไม่ใช่เจ้าของข้อมูลได้ `*_NOT_FOUND` (404) · เวลาปัจจุบันมาจาก `core/clock.js` · งานที่เปลี่ยนสถานะเครื่องล็อกแถวเครื่องก่อนใน transaction · ทุกการเปลี่ยนแปลงเขียน audit log ใน transaction เดียวกัน

## การทดสอบ

- `npm test` = `test:models` (บนฐานทดสอบที่สร้างใหม่) แล้ว `test:services` (สร้างฐานทดสอบใหม่อีกรอบ แล้วรัน `tests/services` + `tests/http`)
- แยก 2 รอบเพราะ service เปิด transaction เอง test ของ service/HTTP จึง commit ข้อมูลจริงลงฐานทดสอบ ส่วน test ของ model บางข้อคาดว่ามีแค่ข้อมูลตั้งต้น
- `scripts/create-test-db.js` คัดลอกตาราง, View และข้อมูลตั้งต้นจาก `notebook_loan` (อ่านอย่างเดียว ไม่แก้ฐานจริง)
- รันไฟล์เดียว: `npm run test:setup-db` แล้ว `node --test tests/services/loans.test.js`

## จุดที่ต่างจากเอกสาร (ยึดตาม `notebook_loan.sql`)

| เรื่อง | เอกสาร | โค้ด |
| --- | --- | --- |
| permission | `catalog.manage`, `user.manage`, `loan.confirm_return`, `loan.return` | ใช้ชื่อตาม seed: `brand.manage`, `model.manage`, `notebook.create/update/delete`, `user.view_all` / `user.update_any`, `loan.receive`, `loan.return_request`, `reservation.cancel_own` (แก้ที่ `services/core/permissionCodes.js` ที่เดียว) |
| audit กู้คืนข้อมูล | action `RESTORE` | ENUM ใน SQL ไม่มี จึงใช้ `UPDATE` + `newValues.event = 'restore'` |
| notification type | `reservation_starting_soon` | `reservation_starting` |
| setting key | `notifyBeforeDueMinutes` | `reminderBeforeMinutes` (ใช้กับ PATCH /settings ด้วย) |
| constraint | `uq_notebook_models_*`, `uq_notebooks_serial_number` | `uq_models_brand_name`, `uq_notebooks_serial` |
| `storageGb` | 1–8192 | 32–8192 ตาม CHECK ใน DB |
| error code เพิ่ม | – | `NOT_FOUND` (route ไม่มี), `AUDIT_LOG_NOT_FOUND` (G2) |
| แอดมิน | แผนตาราง 3.3 ให้แอดมินไม่มี `loan.create`, `reservation.create` | seed ให้แอดมินทุกสิทธิ์ แอดมินจึงยืม/จองได้ (แก้ที่ seed ถ้าไม่ต้องการ) |

## จุดที่ต่างจากหรือเพิ่มจาก Model Layer.md

| เรื่อง | รายละเอียด |
| --- | --- |
| strict mode | ทุก connection ตั้ง `STRICT_ALL_TABLES` เพราะ XAMPP ค่าเริ่มต้นไม่ strict ค่าที่ยาวเกิน column จะถูกตัดทิ้งเงียบๆ ตอนนี้ได้ `DbError` code `DB_ERROR` แทน |
| `core/db.js` | เพิ่ม `queryPage()` ให้ทุก `list` ใช้ร่วมกัน (SELECT หน้าปัจจุบัน + COUNT) |
| `core/sqlBuilder.js` | เพิ่ม `buildWhere()` และ `likeParam()` (escape `%` `_` ใน keyword) |
| `loans.listWhere()` | export เพิ่มเพื่อให้ `reports.outstandingLoans` ใช้ SELECT เดียวกับ loans |
| options ที่มีค่าเพิ่ม | `isEmailTaken`, `findOverlapping`, `findAvailableInRange` รับ `excludeId`/`modelId` รวมใน object เดียวกับ `conn` เช่น `{ excludeId, conn }` |
