# Business Logic Layer – แผนการทำงานและคู่มือ Service (ระบบยืมคืนโน๊ตบุ๊ค)

Oct 8, 2026 · Phase 3 Design Business Logic
อ้างอิง: `requirement-summary.md` (ปรับปรุง 8 ต.ค. 2026), `Model Layer.md`

> สัญลักษณ์: **[ตาม requirement]** = มาจากเอกสาร requirement · **[สมมติฐาน]** = ผู้ออกแบบกำหนด แก้ได้ · **[ต้องตรวจกับ SQL]** = ต้องเทียบค่ากับ `notebook_loan.sql` ก่อนเขียนโค้ด

---

## 1. ภาพรวม

Business Logic Layer (ต่อไปเรียก **service layer**) อยู่ระหว่าง Controller และ Model เป็นชั้นเดียวที่ "ตัดสินใจ" ตามกฎธุรกิจ ส่วน Model ทำแค่อ่าน/เขียนข้อมูล

```text
Frontend ──HTTP──► Route ► Middleware ► Controller ──► Service (ชั้นนี้) ──► Model ──► MariaDB
                   └──────── ยังไม่ทำรอบนี้ ────────┘                       (ทำเสร็จแล้ว)
```

**ขอบเขตรอบนี้:** service, validator, scheduled job และ helper ที่ service ใช้ (JWT, bcrypt, logger) เท่านั้น ยังไม่ทำ route, controller, middleware และ frontend ส่วน HTTP API อยู่ในไฟล์ `http-api-spec.md` เป็นสัญญา (contract) ให้ controller และ frontend ใช้ในรอบถัดไป

### Service ทำ / ไม่ทำ

| Service ทำ | Service ไม่ทำ |
| --- | --- |
| validate และ sanitize input ทุกตัว | อ่าน `req` / เขียน `res` (เป็นหน้าที่ controller) |
| ตรวจ permission และ ownership | เขียน SQL เอง (เรียก model เท่านั้น) |
| ตัดสินกฎที่ขึ้นกับเวลาปัจจุบัน (ยืมได้ไหม, ต่อเวลาได้ไหม, จองได้ไหม) | แปลง `AppError` เป็น HTTP response (error middleware ทำ) |
| เปิด transaction และล็อกแถวเครื่องก่อนตรวจกฎ | อัปโหลดไฟล์รูป (middleware รับไฟล์ แล้วส่ง path ให้ service) |
| เขียน audit log ทุกการเปลี่ยนแปลง | |
| สร้างแจ้งเตือนในระบบ | |
| แปลง `DbError` เป็น `AppError` ที่มีข้อความภาษาไทย | |
| สร้าง DTO ตาม role (สมาชิกไม่เห็นข้อมูลภายใน เช่น serial number) | |

### การตัดสินใจทางเทคนิค

- ES Modules เหมือน model layer ใช้ Node.js 20 LTS ขึ้นไป
- ทุกฟังก์ชัน service รับ **`ctx` (ผู้กระทำ) เป็น parameter แรก** และ `input` เป็น parameter ที่สอง ทำให้ทดสอบได้โดยไม่ต้องมี Express
- เขียน validator เองแบบเบาๆ ไม่ใช้ library เพื่อให้ dependency น้อยตามแนวทางของ model layer **[สมมติฐาน]**
- เวลาปัจจุบันเอามาจาก `clock.now()` ที่เดียว ทำให้ test เลื่อนเวลาได้
- ใช้ `bcryptjs` (bcrypt แบบ pure JS) แทน `bcrypt` เพราะไม่ต้อง compile native บน Windows/XAMPP อัลกอริทึมเหมือนกันและ hash ใช้ร่วมกันได้ **[สมมติฐาน]**

---

## 2. โครงสร้างโฟลเดอร์และ Dependency

ต่อจากโครงสร้างของ model layer เพิ่มเฉพาะโฟลเดอร์ `services/` และ `jobs/`

```text
backend/
├─ .env.example                 เพิ่มตัวแปรของ service (ข้อ 2.2)
├─ src/
│  ├─ config/database.js        (มีแล้ว)
│  ├─ models/                   (มีแล้ว)
│  ├─ services/
│  │  ├─ core/
│  │  │  ├─ AppError.js         class AppError { code, status, message, details }
│  │  │  ├─ errorCodes.js       รายการ error code + HTTP status + ข้อความไทย
│  │  │  ├─ dbErrorMapper.js    DbError → AppError ตามชื่อ constraint
│  │  │  ├─ clock.js            now(), setNowForTest()
│  │  │  ├─ context.js          สร้าง ctx จาก token และ request
│  │  │  ├─ authorize.js        requirePermission(), requireOwnerOr()
│  │  │  ├─ audit.js            writeAudit() ห่อ auditLogs.insert
│  │  │  ├─ settingsCache.js    อ่าน settings แบบ cache + invalidate
│  │  │  ├─ logger.js           เขียน log ลงไฟล์ logs/app-YYYY-MM-DD.log
│  │  │  ├─ password.js         hash(), compare() ด้วย bcryptjs
│  │  │  ├─ token.js            sign(), verify() ด้วย jsonwebtoken
│  │  │  ├─ dto.js              แปลง object จาก model เป็น object ที่ส่งออก API
│  │  │  └─ notificationText.js ข้อความแจ้งเตือนภาษาไทยตาม type
│  │  ├─ validators/
│  │  │  ├─ rules.js            ตัวตรวจพื้นฐาน (required, email, int, date, enum, length)
│  │  │  ├─ auth.validator.js
│  │  │  ├─ catalog.validator.js     brands, models, notebooks
│  │  │  ├─ loan.validator.js
│  │  │  ├─ reservation.validator.js
│  │  │  ├─ user.validator.js
│  │  │  └─ setting.validator.js
│  │  ├─ auth.service.js
│  │  ├─ profile.service.js
│  │  ├─ brands.service.js
│  │  ├─ notebookModels.service.js
│  │  ├─ notebooks.service.js
│  │  ├─ loans.service.js
│  │  ├─ reservations.service.js
│  │  ├─ notifications.service.js
│  │  ├─ users.service.js           (แอดมินจัดการสมาชิก)
│  │  ├─ settings.service.js
│  │  ├─ auditLogs.service.js
│  │  ├─ reports.service.js
│  │  └─ index.js                   export รวมทุก service
│  └─ jobs/
│     ├─ notification.job.js        งานสร้างแจ้งเตือน (เรียกได้ตรงๆ ใน test)
│     └─ scheduler.js               ตั้ง node-cron ทุก 5 นาที
├─ logs/                            (สร้างอัตโนมัติ, ใส่ใน .gitignore)
└─ tests/
   └─ services/*.test.js            1 ไฟล์ test ต่อ 1 service
```

### 2.1 Package ที่เพิ่ม

| Package | ใช้ทำอะไร |
| --- | --- |
| bcryptjs | hash และตรวจรหัสผ่าน |
| jsonwebtoken | สร้างและตรวจ JWT |
| node-cron | scheduled job ทุก 5 นาที |

(ต่อจาก `mysql2`, `dotenv` ของ model layer · test ยังใช้ `node:test`)

### 2.2 ตัวแปรใน .env

| ตัวแปร | ค่า | หมายเหตุ |
| --- | --- | --- |
| DB_HOST | localhost | (มีแล้ว) |
| DB_PORT | 3306 | (มีแล้ว) |
| DB_USER | root | (มีแล้ว) |
| DB_PASSWORD | *(ว่าง)* | XAMPP ค่าเริ่มต้น |
| DB_NAME | notebook_loan | (มีแล้ว) |
| JWT_SECRET | สุ่มอย่างน้อย 32 ตัวอักษร | ห้าม commit ค่าจริง |
| JWT_EXPIRES_IN | 8h | **[สมมติฐาน]** |
| BCRYPT_ROUNDS | 10 | |
| LOG_DIR | ./logs | |
| JOBS_ENABLED | true | ปิดได้ตอนรัน test |

---

## 3. ข้อตกลงร่วมของทุก Service

### 3.1 รูปแบบฟังก์ชัน

```js
// ทุกฟังก์ชัน: async fn(ctx, input) → DTO | { rows, total, page, pageSize }
export async function borrowNow(ctx, input) { ... }
```

| เรื่อง | ข้อตกลง |
| --- | --- |
| `ctx` | `{ userId, roleId, roleCode, permissions: Set<string>, ip, userAgent }` · ผู้ที่ยังไม่ login ใช้ `ctx` ที่มีแค่ `ip`, `userAgent` |
| `input` | object ธรรมดา (controller รวม params, query, body มาให้) |
| สำเร็จ | คืน DTO (ไม่มี `passwordHash`, field ภายในถูกตัดตาม role) |
| ไม่สำเร็จ | `throw new AppError(code, { details })` เสมอ ไม่คืน `null` ให้ controller ตีความเอง |
| ไม่พบข้อมูล / ไม่ใช่เจ้าของ | throw `*_NOT_FOUND` (404) ทั้งสองกรณี เพื่อไม่ให้สมาชิกเดาได้ว่ามี id นี้ของคนอื่น **[สมมติฐาน]** |
| list | คืน `{ rows, total, page, pageSize }` ตาม model · validate `page ≥ 1`, `1 ≤ pageSize ≤ 100` |
| เวลา | รับ ISO 8601 string จาก input แปลงเป็น `Date` ใน validator · เทียบกับ `clock.now()` เท่านั้น |

### 3.2 AppError และการแปลง DbError

```js
class AppError extends Error {
  constructor(code, { details, message } = {}) {
    const def = ERROR_CODES[code];          // { status, message }
    super(message ?? def.message);
    this.code = code; this.status = def.status; this.details = details;
  }
}
```

`dbErrorMapper.js` แปลง `DbError` จาก model ตามตารางนี้ (ชื่อ constraint **[ต้องตรวจกับ SQL]**)

| DbError code | constraint | AppError |
| --- | --- | --- |
| DUPLICATE | `uq_users_email` | EMAIL_TAKEN |
| DUPLICATE | `uq_users_member_code` | MEMBER_CODE_TAKEN |
| DUPLICATE | `uq_brands_name` | BRAND_NAME_TAKEN |
| DUPLICATE | `uq_notebook_models_*` | MODEL_NAME_TAKEN |
| DUPLICATE | `uq_notebooks_asset_code` | ASSET_CODE_TAKEN |
| DUPLICATE | `uq_notebooks_serial_number` | SERIAL_NUMBER_TAKEN |
| DUPLICATE | `uq_loans_active_notebook` | NOTEBOOK_ALREADY_BORROWED |
| CHECK_FAILED | ตาราง loans | LOAN_DURATION_EXCEEDED |
| CHECK_FAILED | ตาราง reservations | INVALID_TIME_RANGE |
| FK_NOT_FOUND | ใดๆ | REFERENCE_NOT_FOUND |
| FK_IN_USE | ใดๆ | RESOURCE_IN_USE |
| INVALID_COLUMN, DB_ERROR | – | INTERNAL_ERROR (log `cause` ลงไฟล์ ไม่ส่งให้ผู้ใช้) |

ข้อตกลง: service **ตรวจก่อนเสมอ** (เช่น `isEmailTaken`) เพื่อให้ข้อความชัด ส่วน constraint ใน DB เป็นด่านสุดท้ายกันกรณีคำขอพร้อมกัน ซึ่ง mapper ด้านบนจะแปลงให้ได้ error code เดียวกัน

### 3.3 สิทธิ์ (RBAC)

ตรวจ permission ที่ต้นทุกฟังก์ชันด้วย `requirePermission(ctx, 'loan.create')` ถ้าไม่มีสิทธิ์จะเขียน audit `PERMISSION_DENIED` แล้ว throw `FORBIDDEN`

รายการ permission ที่ service ใช้ **[สมมติฐาน] [ต้องตรวจกับ SQL]** ถ้า seed ใน `notebook_loan.sql` ใช้ชื่ออื่น ให้แก้ที่ไฟล์ `services/core/permissionCodes.js` ที่เดียว

| Permission | member | admin | ใช้กับ |
| --- | :-: | :-: | --- |
| `notebook.view` | ✅ | ✅ | ค้นหา/ดูเครื่อง ยี่ห้อ รุ่น |
| `loan.create` | ✅ | | ยืมทันที, รับเครื่องจากการจอง |
| `loan.extend` | ✅ | | ต่อเวลา (ของตัวเอง) |
| `loan.return` | ✅ | | กดคืน (ของตัวเอง) |
| `loan.view_all` | | ✅ | ดูการยืมทุกคน |
| `loan.confirm_return` | | ✅ | ยืนยันรับคืน |
| `loan.cancel` | | ✅ | ยกเลิกรายการยืม |
| `reservation.create` | ✅ | | จอง, ยกเลิกการจองของตัวเอง |
| `reservation.view_all` | | ✅ | ดูการจองทุกคน |
| `reservation.cancel_any` | | ✅ | ยกเลิกการจองของทุกคน |
| `catalog.manage` | | ✅ | จัดการยี่ห้อ รุ่น เครื่อง |
| `user.manage` | | ✅ | ดู แก้ไข ระงับ ลบสมาชิก |
| `setting.manage` | | ✅ | แก้ค่าตั้งค่า |
| `report.view` | | ✅ | รายงาน |
| `audit.view` | | ✅ | Audit Log |

งานของตัวเองที่ทุกคนที่ login ทำได้ (ไม่ต้องมี permission): ดู/แก้โปรไฟล์, เปลี่ยนรหัสผ่าน, ดูประวัติตัวเอง, แจ้งเตือนของตัวเอง

Permission ของแต่ละ role cache ไว้ในหน่วยความจำ (`Map<roleId, Set<code>>`) โหลดจาก `rolePermissions.findPermissionCodesByRoleId` ครั้งแรกที่ใช้ เพราะเวอร์ชันแรกแก้ role/permission ผ่าน DB เท่านั้น (ต้อง restart เมื่อแก้ seed)

### 3.4 Transaction และลำดับการล็อก

งานที่ต้องอยู่ใน `withTransaction` และล็อกแถวเครื่องด้วย `notebooks.lockById` **ก่อน**อ่านข้อมูลการยืม/การจองทุกครั้ง **[ตาม requirement]**

| งาน | ล็อก | เหตุผล |
| --- | --- | --- |
| ยืมทันที | notebook | กันสองคนยืมเครื่องเดียวกันพร้อมกัน |
| รับเครื่องจากการจอง | notebook | กันชนกับการยืมทันที |
| ต่อเวลา | notebook | กันชนกับการจองที่เกิดขึ้นพร้อมกัน |
| จองล่วงหน้า | notebook | กันสองคนจองช่วงเดียวกัน |
| ยืนยันรับคืน | notebook | อัปเดต loans + notebooks พร้อมกัน |
| ลบ/ปลดระวางเครื่อง | notebook | กันมีคนยืมระหว่างลบ |

กฎ: ล็อกได้ครั้งละ 1 เครื่อง และล็อกก่อนเสมอ (ห้ามอ่าน loans ก่อนแล้วค่อยล็อก) เพื่อไม่ให้เกิด deadlock · audit log เขียนใน transaction เดียวกัน (ถ้า rollback ก็ไม่มี log ของงานที่ไม่สำเร็จ)

### 3.5 Audit Log และ Log ไฟล์

| เหตุการณ์ | เก็บที่ | action **[ต้องตรวจกับ SQL]** |
| --- | --- | --- |
| Login สำเร็จ / ไม่สำเร็จ | audit_logs | `LOGIN_SUCCESS` / `LOGIN_FAILED` |
| Logout | audit_logs | `LOGOUT` |
| Register | audit_logs | `REGISTER` |
| สร้าง / แก้ / ลบ / กู้คืน ข้อมูลทุกตาราง | audit_logs | `CREATE` / `UPDATE` / `DELETE` / `RESTORE` + `targetTable`, `targetId`, `oldValues`, `newValues` |
| ไม่มีสิทธิ์ | audit_logs | `PERMISSION_DENIED` |
| Validation ไม่ผ่าน | ไฟล์ | level `warn` |
| DB error / server error | ไฟล์ | level `error` พร้อม stack (ไม่ส่งให้ผู้ใช้) |
| ยืม คืน ต่อเวลา จอง (API สำคัญ) | ไฟล์ | level `info` |

เหตุการณ์ของธุรกรรมใช้ action มาตรฐาน แล้วใส่ชนิดเหตุการณ์ใน `newValues.event` เช่น ต่อเวลา = `UPDATE` + `{ event: 'extend', dueAt: ... }` และ `oldValues: { dueAt: เดิม }` **[ตาม requirement: บันทึกกำหนดคืนเดิมและใหม่]**

### 3.6 Settings

`settingsCache.get()` อ่าน `settings.getAll()` แล้ว cache 60 วินาที และล้าง cache ทันทีเมื่อ `settings.service.update` ทำงาน ภายใน transaction ให้อ่านด้วย `settings.get(key, { conn })` ตรงๆ เพื่อให้ได้ค่าล่าสุด

| key (camelCase) **[ต้องตรวจกับ SQL]** | ค่าเริ่มต้น | ช่วงที่ยอมรับตอนแก้ |
| --- | --- | --- |
| `maxLoanHours` | 24 | 1–24 |
| `reservationMaxDaysAhead` | 7 | 1–30 **[สมมติฐาน]** |
| `reservationGraceMinutes` | 30 | 5–120 **[สมมติฐาน]** |
| `notifyBeforeDueMinutes` | 60 | 5–240 **[สมมติฐาน]** |
| `maxActiveLoansPerUser` | 1 | 1–5 **[สมมติฐาน]** |

---

## 4. แผนการทำงาน

ทำตามลำดับ dependency แต่ละขั้นจบเมื่อ test ผ่าน แล้วส่งให้ตรวจก่อนขั้นถัดไป (รูปแบบเดียวกับ model layer)

| ขั้น | งาน | Deliverable | เกณฑ์ว่าเสร็จ |
| --- | --- | --- | --- |
| 1 | Setup | ติดตั้ง bcryptjs, jsonwebtoken, node-cron · เพิ่มตัวแปร .env | `npm install` ผ่าน, อ่าน JWT_SECRET ได้, ไม่มี secret ใน git |
| 2 | Core | ไฟล์ใน `services/core/` + `validators/rules.js` + test | DbError แปลงถูกทุก code, `requirePermission` เขียน audit ตอนปฏิเสธ, `clock` เลื่อนเวลาได้ใน test, logger เขียนไฟล์ได้ |
| 3 | Auth & Profile | auth.service, profile.service + test | สมัคร/login/logout ได้, รหัสผ่านผิดได้ข้อความเดียวกับอีเมลผิด, บัญชีถูกระงับ login ไม่ได้, ไม่มี passwordHash ใน output |
| 4 | Catalog | brands, notebookModels, notebooks service + test | CRUD ครบ, ลบยี่ห้อ/รุ่นที่ยังถูกใช้ไม่ได้, ลบเครื่องที่มีการยืม/จองค้างไม่ได้, สมาชิกไม่เห็น serial |
| 5 | Reservations | reservations.service + test | ตรวจช่วงเวลา/ล่วงหน้า 7 วัน/ทับซ้อนถูกทุกกรณีขอบ, ยกเลิกของคนอื่นไม่ได้ (ถ้าไม่ใช่แอดมิน) |
| 6 | Loans | loans.service + test | ยืม, รับจากการจอง, ต่อเวลา, กดคืน, ยืนยันรับคืน, ยกเลิก ถูกตามกฎ · test ยืมพร้อมกัน 2 คำขอ ได้สำเร็จ 1 อีก 1 ได้ NOTEBOOK_ALREADY_BORROWED |
| 7 | Notifications & Job | notifications.service, notification.job, scheduler + test | job รันซ้ำไม่สร้างแจ้งเตือนซ้ำ, ต่อเวลาแล้วได้แจ้งเตือนใหม่ตาม dueAt ใหม่ |
| 8 | Admin | users, settings, auditLogs, reports service + test | ระงับตัวเอง/แอดมินคนสุดท้ายไม่ได้, settings นอกช่วงถูกปฏิเสธ, รายงานรายเดือนเติมเดือนที่เป็น 0 |
| 9 | รวมและเอกสาร | services/index.js, README ของ service layer | `npm test` ผ่านทั้งหมด, ทุกฟังก์ชันมี JSDoc, เอกสารตรงกับโค้ด |

**Checklist ตรวจงานทุกขั้น**

- [ ] ทุกฟังก์ชันเริ่มด้วยตรวจสิทธิ์ แล้วตามด้วย validate input
- [ ] ข้อมูลของคนอื่นตรวจ ownership แล้ว (สมาชิกเห็นเฉพาะของตัวเอง)
- [ ] กฎที่ขึ้นกับเวลาใช้ `clock.now()` ไม่ใช้ `new Date()` ตรงๆ
- [ ] งานที่ต้องล็อกทำใน `withTransaction` และล็อกเครื่องก่อนอ่าน
- [ ] มี audit log ทุกการเปลี่ยนแปลงข้อมูล
- [ ] error ทุกตัวเป็น `AppError` ที่มี code อยู่ใน `errorCodes.js`
- [ ] ไม่มี stack trace หรือ `DbError.cause` หลุดออกไปใน `AppError`
- [ ] มี test กรณีปกติ, ผิดกฎ, ไม่มีสิทธิ์, ไม่ใช่เจ้าของ

---

## 5. ขั้นตอนการทำงานของแต่ละ Service

แต่ละฟังก์ชันเขียนเป็นขั้นตอนตามลำดับที่โค้ดจะทำ ชื่อ model function อ้างอิงจาก `Model Layer.md`

### 5.1 auth.service.js

**`register(ctx, input)`** – สมัครสมาชิก ใช้งานได้ทันที **[ตาม requirement]**

1. validate: `email` (รูปแบบอีเมล, ≤ 255, แปลงเป็นตัวเล็ก), `password` (≥ 8 ตัว มีทั้งตัวอักษรและตัวเลข **[สมมติฐาน]**), `firstName`, `lastName` (1–100 ตัว, trim), `phone` (`0` + 9 หลัก), `memberCode` (ไม่บังคับ, 1–30 ตัว)
2. `users.isEmailTaken(email)` → `EMAIL_TAKEN`
3. ถ้ามี memberCode: `users.isMemberCodeTaken(memberCode)` → `MEMBER_CODE_TAKEN`
4. `roles.findByCode('member')` → ไม่พบ = `INTERNAL_ERROR` (seed ผิด)
5. `password.hash(password)`
6. `withTransaction`: `users.insert(...)` → `auditLogs.insert({ action: 'REGISTER', targetTable: 'users', targetId })`
7. สร้าง token (เหมือน login ขั้น 6) คืน `{ token, expiresAt, user }`

**`login(ctx, { email, password })`**

1. validate: มี email และ password
2. `users.findAuthByEmail(email)`
3. ไม่พบ หรือ `password.compare` ไม่ตรง → audit `LOGIN_FAILED` (`userId` ถ้ารู้, `newValues: { email }`) → `INVALID_CREDENTIALS`
4. `isActive = false` → audit `LOGIN_FAILED` (`reason: 'suspended'`) → `ACCOUNT_SUSPENDED`
5. `users.updateLastLogin(id)` + audit `LOGIN_SUCCESS`
6. `token.sign({ sub: id, roleId, roleCode })` อายุตาม `JWT_EXPIRES_IN`
7. โหลด permission ของ role จาก cache คืน `{ token, expiresAt, user, permissions }`

**`logout(ctx)`** – JWT แบบ stateless จึงแค่เขียน audit `LOGOUT` ฝั่ง frontend ลบ token เอง

**`authenticate(bearerToken, { ip, userAgent })`** – ให้ middleware เรียกในรอบถัดไป

1. `token.verify` → ผิด/หมดอายุ → `UNAUTHORIZED`
2. `users.findById(sub)` → ไม่พบ, ถูกลบ, หรือ `isActive = false` → `UNAUTHORIZED` (ทำให้การระงับบัญชีมีผลทันที แม้ token ยังไม่หมดอายุ) **[สมมติฐาน]**
3. คืน `ctx` = `{ userId, roleId, roleCode: user.roleCode, permissions, ip, userAgent }` (ใช้ role จาก DB ไม่ใช่จาก token)

### 5.2 profile.service.js

| ฟังก์ชัน | ขั้นตอน |
| --- | --- |
| `getMe(ctx)` | `users.findById(ctx.userId)` + permissions คืน DTO |
| `updateMe(ctx, input)` | แก้ได้เฉพาะ `firstName, lastName, phone, avatarPath` (อีเมลและรหัสสมาชิกแก้ผ่านแอดมิน **[สมมติฐาน]**) → อ่านค่าเดิม → `users.update` → audit `UPDATE` (old/new เฉพาะ field ที่เปลี่ยน) |
| `changePassword(ctx, { currentPassword, newPassword })` | validate รหัสใหม่ตามนโยบาย และต้องไม่เหมือนรหัสเดิม → `users.findPasswordHashById` → compare ไม่ตรง = `CURRENT_PASSWORD_INCORRECT` → hash → `users.updatePassword` → audit `UPDATE` (`newValues: { event: 'change_password' }` ไม่มีรหัสผ่าน) |

### 5.3 brands.service.js / notebookModels.service.js

| ฟังก์ชัน | ขั้นตอนสำคัญ |
| --- | --- |
| `listBrandOptions(ctx)` | `notebook.view` → `brands.findAll()` (dropdown) |
| `listBrands(ctx, filter)` | `catalog.manage` → `brands.list` |
| `createBrand(ctx, { name })` | validate 1–100 ตัว trim → `brands.findByName` พบ = `BRAND_NAME_TAKEN` → insert → audit |
| `updateBrand(ctx, id, { name })` | พบไหม → ชื่อซ้ำกับยี่ห้ออื่น → update → audit (old/new) |
| `deleteBrand(ctx, id)` | `brands.countActiveModels(id) > 0` → `BRAND_IN_USE` → softDelete → audit `DELETE` |
| `restoreBrand(ctx, id)` | `brands.restore` → audit `RESTORE` |
| `listModels(ctx, filter)` | `notebook.view` → `notebookModels.list` |
| `getById(ctx, id)` | `notebook.view` → `notebookModels.findById` → ไม่พบ = `MODEL_NOT_FOUND` |
| `createModel(ctx, input)` | validate `brandId`, `modelName`, `cpu`, `ramGb` (1–256), `storageGb` (1–8192), `screenInch` (10.0–18.0), `os`, `imagePath?` → `brands.findById` ไม่พบ/ถูกลบ = `BRAND_NOT_FOUND` → `findByBrandAndName` ซ้ำ = `MODEL_NAME_TAKEN` → insert → audit |
| `updateModel(ctx, id, input)` | เหมือน create แต่ส่งเฉพาะ field ที่แก้ ตรวจชื่อซ้ำเมื่อแก้ brandId หรือ modelName |
| `deleteModel(ctx, id)` | `notebookModels.countActiveNotebooks(id) > 0` → `MODEL_IN_USE` → softDelete → audit |
| `restoreModel(ctx, id)` | ยี่ห้อของรุ่นต้องไม่ถูกลบ ไม่งั้น `BRAND_NOT_FOUND` → restore → audit |

### 5.4 notebooks.service.js

**DTO ตาม role:** สมาชิกได้ `id, assetCode, currentStatus, modelName, brandName, cpu, ramGb, storageGb, screenInch, os, imagePath` · แอดมินได้ครบทุก field รวม `serialNumber, conditionStatus, conditionNote, purchasedAt, deletedAt`

| ฟังก์ชัน | ขั้นตอน |
| --- | --- |
| `list(ctx, filter)` | `notebook.view` → สมาชิกกรองได้ `keyword, brandId, modelId, currentStatus` · แอดมินได้เพิ่ม `conditionStatus, includeDeleted` → `notebooks.list` → DTO |
| `getById(ctx, id)` | `notebooks.findById` → ไม่พบ = `NOTEBOOK_NOT_FOUND` · แอดมินได้ `activeLoan` (`loans.findActiveByNotebook`) และ `upcomingReservations` เพิ่ม |
| `getByAssetCode(ctx, assetCode)` | สำหรับสแกน barcode → `notebooks.findByAssetCode` (trim, ตัวพิมพ์ใหญ่) |
| `searchAvailable(ctx, { startAt, endAt, modelId? })` | validate ช่วงเวลาเหมือนการจอง (ข้อ 5.6 ขั้น 1–2) → `notebooks.findAvailableInRange` |
| `create(ctx, input)` | `catalog.manage` → validate `modelId`, `assetCode` (1–50, ตัวพิมพ์ใหญ่), `serialNumber` (1–100), `conditionStatus` (enum), `conditionNote?`, `purchasedAt?` (≤ วันนี้) → รุ่นต้องมีอยู่ → `findByAssetCode` ซ้ำ = `ASSET_CODE_TAKEN` → `findBySerialNumber` ซ้ำ = `SERIAL_NUMBER_TAKEN` → insert → audit |
| `update(ctx, id, input)` | ดูขั้นตอนด้านล่าง |
| `delete(ctx, id)` | `withTransaction`: `lockById` → ไม่พบ = `NOTEBOOK_NOT_FOUND` → `countOpenCommitments` มี `activeLoans` หรือ `upcomingReservations` > 0 = `NOTEBOOK_HAS_COMMITMENTS` (ส่งจำนวนใน details) **[ตาม requirement]** → softDelete → audit |
| `restore(ctx, id)` | restore → audit |

**`update(ctx, id, input)` เมื่อเปลี่ยน `conditionStatus`** ใน `withTransaction` + `lockById`

- เป็น `retired` (ปลดระวาง): มีการยืมค้างหรือการจองในอนาคต → `NOTEBOOK_HAS_COMMITMENTS`
- เป็น `damaged` หรือ `maintenance`: ทำได้ แต่ถ้ามีการจองในอนาคต คืน `warnings.affectedReservations` ให้แอดมินตัดสินใจยกเลิกเอง **[สมมติฐาน]**
- ค่า enum ของ `conditionStatus`: `normal, damaged, maintenance, retired` **[ต้องตรวจกับ SQL]**

### 5.5 loans.service.js

กฎทั้งหมดในหัวข้อนี้มาจาก requirement ข้อ 5 · `now = clock.now()` · ค่าตั้งค่าอ่านใน transaction

**`borrowNow(ctx, { notebookId | assetCode, dueAt })`** – สมาชิกยืมทันที

1. `loan.create` · validate: ต้องมี `notebookId` หรือ `assetCode` อย่างใดอย่างหนึ่ง, `dueAt` เป็นวันเวลาที่ถูกต้อง
2. ถ้าส่ง `assetCode` มา: `notebooks.findByAssetCode` เพื่อหา id
3. `withTransaction(conn)`:
   1. `notebooks.lockById(id)` → ไม่พบหรือถูกลบ = `NOTEBOOK_NOT_FOUND`
   2. `conditionStatus ≠ 'normal'` → `NOTEBOOK_NOT_AVAILABLE`
   3. `maxLoanHours = settings.get('maxLoanHours')` · ตรวจ `dueAt > now` และ `dueAt − now ≤ maxLoanHours` ไม่งั้น `INVALID_DUE_AT`
   4. `loans.findActiveByNotebook(id)` → มี = `NOTEBOOK_ALREADY_BORROWED`
   5. `loans.countActiveByUser(userId) ≥ maxActiveLoansPerUser` → `LOAN_LIMIT_REACHED`
   6. `reservations.findOverlapping(id, now, dueAt)`:
      - มีของคนอื่น → `RESERVATION_CONFLICT` (details: ช่วงเวลาที่ว่างได้ถึง = `startAt` ของการจองแรก ไม่บอกชื่อคนจอง)
      - มีของตัวเอง → `OWN_RESERVATION_OVERLAP` "กรุณารับเครื่องจากการจองของคุณ หรือยกเลิกการจองก่อน" **[สมมติฐาน]**
   7. `loans.insert({ userId, notebookId, borrowedAt: now, dueAt })` (DbError แปลงตามข้อ 3.2)
   8. audit `CREATE` (`targetTable: 'loans'`, `newValues: { event: 'borrow', ... }`)
4. log ไฟล์ `info` แล้วคืน Loan DTO

**`pickupReservation(ctx, reservationId)`** – รับเครื่องตามที่จอง การจองกลายเป็นการยืม

1. `loan.create` · `withTransaction(conn)`:
   1. `reservations.findById` → ไม่พบหรือไม่ใช่ของตัวเอง = `RESERVATION_NOT_FOUND`
   2. `notebooks.lockById(reservation.notebookId)` แล้ว `reservations.findById` อีกครั้งใน conn (ได้สถานะล่าสุดหลังล็อก)
   3. ตรวจ `status`: `upcoming` = `RESERVATION_NOT_STARTED` · `expired` = `RESERVATION_EXPIRED` · `cancelled` = `RESERVATION_CANCELLED` · `fulfilled` = `RESERVATION_ALREADY_PICKED_UP` · ต้องเป็น `active`
   4. `reservation.endAt ≤ now` → `RESERVATION_EXPIRED` (การจองสั้นกว่าเวลาผ่อนผัน)
   5. เครื่องถูกลบหรือ `conditionStatus ≠ 'normal'` → `NOTEBOOK_NOT_AVAILABLE` (แอดมินควรยกเลิกการจองให้)
   6. `loans.findActiveByNotebook` → มี = `NOTEBOOK_NOT_RETURNED_YET` (คนก่อนยังไม่คืน/แอดมินยังไม่ยืนยัน)
   7. `countActiveByUser ≥ maxActiveLoansPerUser` → `LOAN_LIMIT_REACHED`
   8. `loans.insert({ userId, notebookId, borrowedAt: now, dueAt: reservation.endAt, reservationId })`
   9. audit `CREATE` (`event: 'pickup'`, `reservationId`)
2. คืน Loan DTO

**`extend(ctx, loanId, { newDueAt })`** – ต่อเวลาเอง ไม่ต้องรออนุมัติ

1. `loan.extend` · validate `newDueAt`
2. `withTransaction(conn)`:
   1. `loans.findById` → ไม่พบหรือไม่ใช่ของตัวเอง = `LOAN_NOT_FOUND`
   2. `notebooks.lockById(loan.notebookId)` แล้วอ่าน loan ใหม่ใน conn
   3. `loanStatus`: `overdue` = `LOAN_OVERDUE_CANNOT_EXTEND` · `return_pending`, `returned`, `cancelled` = `LOAN_NOT_ACTIVE` · ต้องเป็น `borrowing` (ยังไม่เกินกำหนด)
   4. `newDueAt ≤ loan.dueAt` → `INVALID_DUE_AT`
   5. `newDueAt − loan.borrowedAt > maxLoanHours` → `LOAN_DURATION_EXCEEDED` (details: `maxDueAt = borrowedAt + maxLoanHours`)
   6. `reservations.findOverlapping(notebookId, loan.dueAt, newDueAt)` → มี = `EXTEND_CONFLICT_RESERVATION` (details: `maxDueAt` = startAt ของการจองแรก)
   7. `loans.extendDueAt(loanId, newDueAt)` → `null` = `LOAN_STATE_CHANGED`
   8. audit `UPDATE` · `oldValues: { dueAt: เดิม }` · `newValues: { event: 'extend', dueAt: ใหม่ }` **[ตาม requirement]**
3. ไม่ต้องสร้างแจ้งเตือนเอง job จะสร้าง "ใกล้ครบกำหนด" ของ `dueAt` ใหม่ให้อัตโนมัติ (`refDueAt` ใหม่ไม่ซ้ำกับของเดิม)

**`requestReturn(ctx, loanId)`** – สมาชิกกดคืน

1. `loan.return` · `loans.findById` → ไม่ใช่ของตัวเอง = `LOAN_NOT_FOUND`
2. `loanStatus` ต้องเป็น `borrowing` หรือ `overdue` ไม่งั้น `LOAN_NOT_ACTIVE` (กดซ้ำ = `RETURN_ALREADY_REQUESTED`)
3. `loans.requestReturn(loanId, { at: now })` → `null` = `LOAN_STATE_CHANGED`
4. audit `UPDATE` (`event: 'request_return'`) · คืน DTO ซึ่งมี `isLate` (ตัดสินจากเวลากดคืน **[ตาม requirement]**)

**`confirmReturn(ctx, loanId, { returnCondition, returnNote?, returnRequestedAt? })`** – แอดมินยืนยันรับเครื่อง

1. `loan.confirm_return` · validate `returnCondition ∈ { normal, damaged }` · ถ้า `damaged` ต้องมี `returnNote` (1–500 ตัว) **[สมมติฐาน]**
2. `withTransaction(conn)`:
   1. `loans.findById` → ไม่พบ = `LOAN_NOT_FOUND` · `lockById(notebookId)`
   2. `loanStatus` เป็น `returned` = `LOAN_ALREADY_RETURNED` · `cancelled` = `LOAN_CANCELLED`
   3. กรณีสมาชิกลืมกดคืน (`returnRequestedAt` ว่าง): เรียก `loans.requestReturn(loanId, { at })` ก่อน โดย `at = input.returnRequestedAt ?? now` (ต้องอยู่ระหว่าง borrowedAt ถึง now) เพื่อให้การตัดสินคืนช้าใช้เวลาที่เครื่องมาถึงจริง **[สมมติฐาน]**
   4. `loans.confirmReturn(loanId, { receivedBy: ctx.userId, returnCondition, returnNote, at: now })` → `null` = `LOAN_STATE_CHANGED`
   5. ถ้า `damaged`: `notebooks.updateCondition(notebookId, 'damaged', returnNote)` **[ตาม requirement]** แล้วหาการจองในอนาคตของเครื่องนี้ (`reservations.findOverlapping(notebookId, now, now + reservationMaxDaysAhead วัน)`)
   6. audit `UPDATE` ของ loans และ (ถ้ามี) `UPDATE` ของ notebooks
3. คืน `{ loan, warnings: { affectedReservations } }`

**`cancel(ctx, loanId, { reason })`** – แอดมินยกเลิก

1. `loan.cancel` · validate `reason` 1–500 ตัว (บังคับ) **[สมมติฐาน]**
2. `withTransaction`: `loans.cancel(loanId, { cancelledBy, reason })` → `null` = `LOAN_CANNOT_CANCEL` (รับคืนแล้วหรือยกเลิกไปแล้ว) → `notifications.insertIfNotExists({ type: 'loan_cancelled', loanId })` → audit
3. คืน DTO

**ฟังก์ชันอ่าน**

| ฟังก์ชัน | ขั้นตอน |
| --- | --- |
| `listMine(ctx, filter)` | `loans.listByUser(ctx.userId, filter)` |
| `getById(ctx, loanId)` | ถ้าไม่มี `loan.view_all` ต้องเป็นเจ้าของ ไม่งั้น `LOAN_NOT_FOUND` · เพิ่ม field คำนวณ `canExtend`, `maxExtendDueAt`, `canRequestReturn` ให้ frontend เปิด/ปิดปุ่ม |
| `listAll(ctx, filter)` | `loan.view_all` → `loans.list` |
| `listPendingReturn(ctx, filter)` | `loan.confirm_return` → `loans.listPendingReturn` |

`maxExtendDueAt` = ค่าน้อยสุดของ (`borrowedAt + maxLoanHours`, `startAt` ของการจองถัดไปที่ทับ)

### 5.6 reservations.service.js

**`create(ctx, { notebookId, startAt, endAt })`**

1. `reservation.create` · validate วันเวลา
2. ตรวจกฎเวลา (ก่อนเปิด transaction):
   - `startAt > now` ไม่งั้น `INVALID_TIME_RANGE` (อยากใช้ตอนนี้ให้ยืมทันที)
   - `endAt > startAt` และ `endAt − startAt ≤ maxLoanHours` → `INVALID_TIME_RANGE`
   - `startAt ≤ now + reservationMaxDaysAhead วัน` → `RESERVATION_TOO_FAR_AHEAD`
3. `withTransaction(conn)`:
   1. `notebooks.lockById` → ไม่พบ/ถูกลบ = `NOTEBOOK_NOT_FOUND` · `conditionStatus ≠ 'normal'` = `NOTEBOOK_NOT_AVAILABLE`
   2. `reservations.findOverlapping(notebookId, startAt, endAt)` → มี = `RESERVATION_CONFLICT`
   3. `loans.findOverlapping(notebookId, startAt, endAt)` → มี = `LOAN_CONFLICT`
   4. `reservations.insert(...)` → audit `CREATE`
4. คืน Reservation DTO

หมายเหตุ: การยืมที่เกินกำหนดแล้วจะไม่ทับช่วงอนาคต (model ใช้ `[borrowedAt, dueAt]`) จึงจองได้ ถ้าถึงเวลารับแล้วเครื่องยังไม่คืน ผู้จองจะได้ `NOTEBOOK_NOT_RETURNED_YET` ตอนรับเครื่อง ซึ่งเป็นพฤติกรรมที่ยอมรับ **[สมมติฐาน]**

**`cancel(ctx, reservationId, { reason? })`**

1. `reservations.findById` → ไม่พบ = `RESERVATION_NOT_FOUND`
2. ถ้าเป็นของตัวเอง: ต้องมี `reservation.create` · ถ้าไม่ใช่ของตัวเอง: ต้องมี `reservation.cancel_any` (ไม่มี = `RESERVATION_NOT_FOUND`) และต้องมี `reason`
3. `reservations.cancel(id, { cancelledBy: ctx.userId, reason })` → `null` = `RESERVATION_CANNOT_CANCEL`
4. ถ้าแอดมินยกเลิกของคนอื่น: `notifications.insertIfNotExists({ type: 'reservation_cancelled', reservationId })` **[ตาม requirement]**
5. audit `UPDATE` (`event: 'cancel'`) ทั้งหมดใน transaction เดียว

**ฟังก์ชันอ่าน:** `listMine` (`reservations.listByUser`), `getById` (ownership เหมือน loans), `listAll` (`reservation.view_all` → `reservations.list`)

### 5.7 notifications.service.js

| ฟังก์ชัน | ขั้นตอน |
| --- | --- |
| `listMine(ctx, { unreadOnly, page, pageSize })` | `notifications.listByUser` → เติม `title`, `message` จาก `notificationText.js` ตาม type |
| `countUnread(ctx)` | `notifications.countUnreadByUser` |
| `markRead(ctx, id)` | `notifications.markRead(id, ctx.userId)` → `false` = `NOTIFICATION_NOT_FOUND` |
| `markAllRead(ctx)` | คืน `{ updated: number }` |

ข้อความแจ้งเตือน (type **[ต้องตรวจกับ SQL]**)

| type | หัวข้อ | ข้อความ |
| --- | --- | --- |
| `loan_due_soon` | ใกล้ครบกำหนดคืน | เครื่อง {assetCode} ครบกำหนดคืนเวลา {refDueAt} |
| `loan_overdue` | เกินกำหนดคืน | เครื่อง {assetCode} เกินกำหนดคืนแล้ว กรุณานำมาคืนโดยเร็ว |
| `reservation_starting_soon` | ใกล้ถึงเวลาจอง | การจองเครื่อง {assetCode} จะเริ่มเวลา {startAt} มารับภายใน {grace} นาที |
| `loan_cancelled` | รายการยืมถูกยกเลิก | รายการยืมเครื่อง {assetCode} ถูกยกเลิกโดยผู้ดูแลระบบ |
| `reservation_cancelled` | การจองถูกยกเลิก | การจองเครื่อง {assetCode} ถูกยกเลิกโดยผู้ดูแลระบบ |

### 5.8 users.service.js (แอดมินจัดการสมาชิก)

| ฟังก์ชัน | ขั้นตอน |
| --- | --- |
| `list(ctx, filter)` | `user.manage` → `users.list` |
| `getById(ctx, id)` | `users.findById` + `loans.countActiveByUser` |
| `update(ctx, id, input)` | แก้ได้ `roleId, memberCode, email, firstName, lastName, phone, avatarPath` → ตรวจอีเมล/รหัสสมาชิกซ้ำด้วย `excludeId` → ถ้าเปลี่ยน role ของแอดมินคนสุดท้าย = `LAST_ADMIN` → update → audit |
| `suspend(ctx, id)` | ห้ามระงับตัวเอง = `CANNOT_MODIFY_SELF` · แอดมินคนสุดท้าย = `LAST_ADMIN` → `users.update(id, { isActive: false })` → audit · การยืมที่ค้างอยู่ยังคืนได้ตามปกติ |
| `activate(ctx, id)` | `isActive: true` → audit |
| `delete(ctx, id)` | ห้ามลบตัวเอง/แอดมินคนสุดท้าย · มีการยืมค้าง = `USER_HAS_ACTIVE_LOANS` → softDelete → audit |
| `restore(ctx, id)` | restore → audit |

"แอดมินคนสุดท้าย" ตรวจด้วย `users.list({ roleId: adminRoleId, isActive: true, pageSize: 1 }).total ≤ 1`

### 5.9 settings.service.js

| ฟังก์ชัน | ขั้นตอน |
| --- | --- |
| `getPublic(ctx)` | ผู้ที่ login แล้ว → คืนค่าที่ frontend ใช้กำหนดฟอร์ม: `maxLoanHours, reservationMaxDaysAhead, reservationGraceMinutes, maxActiveLoansPerUser` |
| `listDetailed(ctx)` | `setting.manage` → `settings.listDetailed` |
| `update(ctx, changes)` | `setting.manage` → validate แต่ละ key ตามช่วงในข้อ 3.6 (key ไม่รู้จัก = `UNKNOWN_SETTING`) → `withTransaction`: วน `settings.set(key, value, { updatedBy })` + audit `UPDATE` ต่อ key (old/new) → ล้าง settingsCache |

### 5.10 auditLogs.service.js และ reports.service.js

| ฟังก์ชัน | ขั้นตอน |
| --- | --- |
| `auditLogs.list(ctx, filter)` | `audit.view` · validate `from ≤ to` → `auditLogs.list` |
| `auditLogs.getById(ctx, id)` | `auditLogs.findById` |
| `reports.summary(ctx)` | `report.view` → `reports.statusSummary` |
| `reports.allNotebooks(ctx, filter)` | `notebooks.list` (DTO แบบแอดมิน) |
| `reports.outstandingLoans(ctx, filter)` | `reports.outstandingLoans` |
| `reports.availableNotebooks(ctx, filter)` | `reports.availableNotebooks` |
| `reports.monthlyLoans(ctx, { fromMonth, toMonth })` | validate `YYYY-MM`, `from ≤ to`, ห่างไม่เกิน 24 เดือน **[สมมติฐาน]** → `reports.monthlyLoans` → เติมเดือนที่ไม่มีข้อมูลเป็น `{ totalLoans: 0, lateLoans: 0 }` |

---

## 6. Scheduled Job (jobs/notification.job.js)

รันทุก 5 นาทีด้วย node-cron **[ตาม requirement]** ฟังก์ชัน `runNotificationJob()` export แยก เพื่อให้ test เรียกตรงได้

1. ถ้ารอบก่อนยังไม่จบ ข้ามรอบนี้ (ตัวแปร `isRunning`)
2. อ่าน `notifyBeforeDueMinutes`, `reservationGraceMinutes` จาก settingsCache
3. `loans.findDueSoon(notifyBeforeDueMinutes)` → แต่ละรายการ `notifications.insertIfNotExists({ type: 'loan_due_soon', loanId, refDueAt: dueAt })`
4. `loans.findOverdueWithoutNotice()` → `insertIfNotExists({ type: 'loan_overdue', loanId, refDueAt: dueAt })`
5. `reservations.findStartingSoon(notifyBeforeDueMinutes)` → `insertIfNotExists({ type: 'reservation_starting_soon', reservationId })` (ใช้ค่าเดียวกับแจ้งเตือนคืน **[สมมติฐาน]**)
6. แต่ละรายการอยู่ใน try/catch ของตัวเอง รายการหนึ่งพังไม่ทำให้รายการอื่นหยุด
7. log ไฟล์สรุป `{ dueSoon, overdue, reservationSoon, failed, durationMs }`

การหมดอายุของการจองไม่ต้องใช้ job เพราะ model คำนวณสถานะ `expired` จาก SQL ทุกครั้งที่อ่าน

---

## 7. การทดสอบ

ใช้ฐานข้อมูล `notebook_loan_test` และ helper เดิมของ model layer (rollback หลังแต่ละ test) · ใช้ `clock.setNowForTest()` เลื่อนเวลา

| กลุ่ม | กรณีสำคัญ |
| --- | --- |
| ยืมทันที | สำเร็จ · เครื่องเสียหาย · เครื่องถูกยืม · ครบโควตา · dueAt เกิน 24 ชม. / อยู่ในอดีต · ทับการจองคนอื่น · ทับการจองตัวเอง |
| คำขอพร้อมกัน | `Promise.all` ยืมเครื่องเดียวกัน 2 คน → สำเร็จ 1 · จองช่วงเดียวกัน 2 คน → สำเร็จ 1 |
| รับจากการจอง | ก่อนเวลาเริ่ม · ในช่วงผ่อนผัน · หลังผ่อนผัน · คนก่อนยังไม่คืน · การจองของคนอื่น |
| ต่อเวลา | สำเร็จ · รวมเกิน 24 ชม. · ทับการจอง · หลังเกินกำหนด · หลังกดคืน · audit มี dueAt เดิม/ใหม่ |
| คืน | กดคืนก่อน/หลังกำหนด (isLate) · กดซ้ำ · แอดมินรับคืนโดยไม่กดก่อน · รับคืนแบบเสียหายแล้วเครื่องเป็น damaged · rollback เมื่อ updateCondition ล้ม |
| จอง | ขอบ 7 วัน · ช่วงยาวพอดี 24 ชม. · ชนขอบพอดี (end = start ไม่ทับ) · ยกเลิกของคนอื่นโดยสมาชิก = 404 |
| สิทธิ์ | สมาชิกเรียกฟังก์ชันแอดมิน = FORBIDDEN + audit PERMISSION_DENIED · ดู loan ของคนอื่น = 404 |
| Auth | รหัสผิดและอีเมลผิดได้ error เดียวกัน · บัญชีถูกระงับแล้ว token เดิมใช้ไม่ได้ |
| Job | รัน 2 รอบติดกันไม่สร้างแจ้งเตือนซ้ำ · ต่อเวลาแล้วได้ due_soon ใหม่ |

---

## 8. สิ่งที่ต้อง Approve / ตัดสินใจ

**ตรวจกับ `notebook_loan.sql` ก่อนเริ่มเขียนโค้ด**

- [ ] รหัส permission ใน seed (ข้อ 3.3) ถ้าต่างกัน แจ้งชื่อจริงมา จะแก้ใน `permissionCodes.js`
- [ ] ค่า enum: `condition_status`, notification `type`, audit `action`, settings key
- [ ] ชื่อ UNIQUE constraint ที่ใช้แปลง error (ข้อ 3.2)

**สมมติฐานที่ขอ approve**

- [ ] ไม่ใช่เจ้าของข้อมูล ตอบ 404 แทน 403
- [ ] ยืมทันทีทับการจองของตัวเองไม่ได้ ต้องรับเครื่องจากการจองหรือยกเลิกก่อน
- [ ] แอดมินรับคืนโดยตรง (สมาชิกลืมกด) ใช้เวลาที่แอดมินระบุหรือเวลาปัจจุบันเป็นเวลากดคืน
- [ ] รับคืนแบบเสียหายต้องมีหมายเหตุ · การยกเลิกโดยแอดมินต้องมีเหตุผล
- [ ] สมาชิกแก้อีเมลและรหัสสมาชิกเองไม่ได้
- [ ] นโยบายรหัสผ่าน ≥ 8 ตัว มีตัวอักษรและตัวเลข · JWT อายุ 8 ชั่วโมง
- [ ] ระงับบัญชีมีผลทันที (ตรวจผู้ใช้จาก DB ทุก request)

**คำถามที่ยังเปิดอยู่ (จาก requirement ข้อ 12 และที่พบเพิ่ม)**

- ไม่มีระบบลืมรหัสผ่าน ควรมีฟังก์ชัน "แอดมินรีเซ็ตรหัสผ่านให้สมาชิก" ไหม (ทำเพิ่มได้ใน users.service ไม่กระทบส่วนอื่น)
- จำกัดจำนวนการจองล่วงหน้าต่อคนไหม (ตอนนี้ไม่จำกัด)
- Export รายงาน PDF/Excel ไหม (ถ้ามี จะเพิ่มฟังก์ชันใน reports.service)
- มีเวลาทำการไหม (ถ้ามี ต้องเพิ่มกฎตรวจ dueAt และเวลาจอง)
- จำกัดจำนวนครั้ง login ผิด (rate limit) ทำที่ middleware ในรอบ controller
