# Model Layer – แผนการทำงานและคู่มือฟังก์ชัน (ระบบยืมคืนโน๊ตบุ๊ค)

Oct 8, 2026 · @Gotji

## ภาพรวม

Model layer คือชั้นเดียวที่คุยกับฐานข้อมูล มี 13 ไฟล์ model (12 ตาราง + 1 ไฟล์สำหรับ View รายงาน) ทุกฟังก์ชันใช้ prepared statement และรับ transaction จากชั้นบนได้ งานรอบนี้ทำเฉพาะชั้นนี้ ยังไม่ทำ service, controller, route หรือ frontend

**Model ทำ / ไม่ทำ**

| Model ทำ | Model ไม่ทำ (เป็นหน้าที่ service) |
| --- | --- |
| insert / update / delete / select ทุกตาราง | ตัดสินว่า "ยืมได้ไหม" "ต่อเวลาได้ไหม" |
| query เฉพาะที่ service ต้องใช้ เช่น หาช่วงจองที่ทับกัน, นับการยืมค้างของสมาชิก | ตรวจสิทธิ์ (permission) และ ownership |
| ล็อกแถว (`SELECT … FOR UPDATE`) ให้ service เรียกใช้ | validate input จากผู้ใช้ |
| แปลงชื่อ field snake\_case ⇄ camelCase และแปลงชนิดข้อมูล | เขียน audit log อัตโนมัติ (service เรียก `auditLogs.insert` เอง) |
| แปลง error ของ DB เป็น `DbError` ที่มี code อ่านง่าย | แปลง error เป็น HTTP status |
| ใส่ guard ใน WHERE ของคำสั่งเปลี่ยนสถานะ (เช่น กดคืนได้เฉพาะรายการที่ยังไม่กดคืน) เพื่อกันคำขอซ้อนกัน | อ่านค่า settings มาตัดสินกฎ |

**ข้อตกลงที่ได้จาก User**

- ES Modules (`import` / `export`) ตั้ง `"type": "module"` ใน package.json
- ชื่อ field ฝั่ง JavaScript เป็น camelCase แปลงจาก/เป็น snake\_case อัตโนมัติ เช่น `due_at` ⇄ `dueAt`
- ขอบเขต: CRUD + query เฉพาะที่ service ต้องใช้ แต่ไม่ตัดสินกฎธุรกิจ

**การตัดสินใจทางเทคนิค**

- ใช้ `mysql2/promise` แบบ connection pool ไม่ใช้ ORM หรือ query builder ภายนอก เพื่อให้เบาและเห็น SQL ตรงๆ
- ชื่อ column ใน SQL มาจาก whitelist ในแต่ละ model เท่านั้น (ชื่อ column ใส่เป็น `?` ไม่ได้) ค่าข้อมูลทุกตัวส่งผ่าน `?`
- ตารางที่มี `deleted_at` ใช้ soft delete เป็นค่าเริ่มต้น และ select ไม่ดึงแถวที่ถูกลบ เว้นแต่ส่ง `includeDeleted: true`
- `audit_logs` มีแค่ insert และ select · `reservations` และ `loans` ไม่มี delete ใช้ `cancel` แทน
- ไม่ส่ง `password_hash` ออกจาก model ยกเว้นฟังก์ชันสำหรับ login โดยเฉพาะ

## โครงสร้างโฟลเดอร์และ Dependency

แยก 1 ไฟล์ต่อ 1 ตาราง ตั้งชื่อไฟล์ตามชื่อตาราง และรวม export ไว้ที่ `models/index.js` ให้ service import จากที่เดียว

```text
backend/
├─ package.json            "type": "module"
├─ .env.example            ค่าเชื่อมต่อ DB ตัวอย่าง
├─ src/
│  ├─ config/
│  │  └─ database.js       สร้าง connection pool (timezone +07:00)
│  └─ models/
│     ├─ core/
│     │  ├─ db.js          query(), withTransaction()
│     │  ├─ mapper.js      snake_case ⇄ camelCase, แปลงชนิดข้อมูล
│     │  ├─ sqlBuilder.js  สร้าง WHERE / SET / ORDER BY / LIMIT จาก whitelist
│     │  └─ DbError.js     แปลง error ของ MySQL เป็น code อ่านง่าย
│     ├─ roles.model.js
│     ├─ permissions.model.js
│     ├─ rolePermissions.model.js
│     ├─ users.model.js
│     ├─ brands.model.js
│     ├─ notebookModels.model.js
│     ├─ notebooks.model.js
│     ├─ reservations.model.js
│     ├─ loans.model.js
│     ├─ notifications.model.js
│     ├─ settings.model.js
│     ├─ auditLogs.model.js
│     ├─ reports.model.js  อ่านจาก View v_loans, v_notebook_status, v_loan_monthly_summary
│     └─ index.js          export รวมทุก model
└─ tests/
   ├─ helpers/testDb.js    เชื่อมฐานข้อมูลทดสอบ + rollback หลังแต่ละ test
   └─ models/*.test.js     1 ไฟล์ test ต่อ 1 model
```

| Package | ใช้ทำอะไร | ประเภท |
| --- | --- | --- |
| mysql2 | เชื่อม MariaDB/MySQL, prepared statement, pool, transaction | dependency |
| dotenv | อ่านค่าจากไฟล์ .env | dependency |
| node:test, node:assert | เขียนและรัน test (มากับ Node.js ไม่ต้องติดตั้ง) | built-in |

ต้องใช้ Node.js 20 LTS ขึ้นไป (รองรับ `node --test` และ `--env-file`)

**ตัวแปรใน .env**

| ตัวแปร | ตัวอย่าง | หมายเหตุ |
| --- | --- | --- |
| DB\_HOST | localhost |  |
| DB\_PORT | 3306 |  |
| DB\_USER | root | XAMPP ค่าเริ่มต้นไม่มีรหัสผ่าน |
| DB\_PASSWORD |  |  |
| DB\_NAME | notebook\_loan |  |
| DB\_POOL\_LIMIT | 10 | จำนวน connection สูงสุดใน pool |
| DB\_TEST\_NAME | notebook\_loan\_test | ฐานข้อมูลแยกสำหรับรัน test |

## แผนการทำงาน

ทำ 8 ขั้นตามลำดับ dependency ของตาราง (ตารางแม่ก่อนตารางลูก) แต่ละขั้นจบเมื่อ test ของขั้นนั้นผ่านทั้งหมด แล้วส่งให้ User ตรวจก่อนไปขั้นถัดไป

| ขั้น | งาน | Deliverable | เกณฑ์ว่าเสร็จ |
| --- | --- | --- | --- |
| 1 | Setup project | package.json, .env.example, config/database.js | `npm install` ผ่าน, เชื่อม DB ได้, query `SELECT 1` สำเร็จ |
| 2 | Core | core/db.js, mapper.js, sqlBuilder.js, DbError.js + test | transaction commit/rollback ถูก, แปลงชื่อ field ถูก, column นอก whitelist ถูกปฏิเสธ, error duplicate/FK/CHECK ได้ code ถูก |
| 3 | Master ไม่มี FK | roles, permissions, brands, settings + test | CRUD ครบ, soft delete/restore ของ brands ทำงาน, settings แปลงชนิดค่าถูก |
| 4 | ผู้ใช้และสิทธิ์ | rolePermissions, users + test | ไม่มี password\_hash หลุดออกจากฟังก์ชันทั่วไป, replaceForRole เป็น atomic |
| 5 | อุปกรณ์ | notebookModels, notebooks + test | ค้นหาด้วย asset\_code ได้, lockById ล็อกแถวจริงใน transaction |
| 6 | ธุรกรรม | reservations, loans + test | query ช่วงเวลาทับกันถูกทุกกรณีขอบ, guard ใน WHERE กันการเปลี่ยนสถานะซ้ำ |
| 7 | ระบบและรายงาน | notifications, auditLogs, reports + test | insertIfNotExists ไม่สร้างแจ้งเตือนซ้ำ, JSON ใน audit log อ่านกลับได้, รายงาน 4 แบบได้ผลตรง |
| 8 | รวมและเอกสาร | models/index.js, README ของ model layer | `npm test` ผ่านทั้งหมด, เอกสารฟังก์ชันตรงกับโค้ด |

**Checklist ตรวจงานทุกขั้น**

- [ ] ทุก query ใช้ `?` ไม่มีการต่อ string ค่าที่มาจากภายนอก
- [ ] ชื่อ column และ sort มาจาก whitelist เท่านั้น
- [ ] ทุกฟังก์ชันรับ `{ conn }` และใช้ได้ทั้งในและนอก transaction
- [ ] ผลลัพธ์เป็น camelCase และชนิดข้อมูลถูก (Date, Number, Boolean)
- [ ] ไม่พบข้อมูลคืนค่า `null` (ไม่ throw)
- [ ] error ของ DB ถูกแปลงเป็น `DbError` เสมอ
- [ ] ทุกฟังก์ชันมี JSDoc อธิบาย parameter, return และตัวอย่าง
- [ ] มี test ทั้งกรณีปกติและกรณีผิดพลาด

## Core และข้อตกลงร่วมของทุกฟังก์ชัน

ทุก model ใช้ 4 ไฟล์ใน `core/` ร่วมกัน ทำให้ทุกฟังก์ชันรับ parameter และคืนค่าแบบเดียวกัน

### ข้อตกลงร่วม

| เรื่อง | ข้อตกลง |
| --- | --- |
| Parameter สุดท้าย | `options` = `{ conn?, includeDeleted? }` · ส่ง `conn` เมื่ออยู่ใน transaction, ไม่ส่งจะใช้ pool |
| ค้นหา 1 แถว (`findById`, `findByX`) | คืน object หรือ `null` ถ้าไม่พบ (ไม่ throw) |
| ค้นหาหลายแถว (`list`) | คืน `{ rows, total, page, pageSize }` |
| `insert` | คืน object ที่สร้างแล้ว (อ่านกลับจาก DB ให้ได้ค่า default ครบ) |
| `update` | คืน object หลังแก้ หรือ `null` ถ้าไม่พบแถว · ส่งเฉพาะ field ที่จะแก้ |
| `softDelete`, `restore`, `hardDelete` | คืน `true` ถ้ามีแถวถูกเปลี่ยน, `false` ถ้าไม่พบ |
| ฟังก์ชันเปลี่ยนสถานะ (`cancel`, `requestReturn` ฯลฯ) | มี guard ใน WHERE คืน object หลังแก้ หรือ `null` = ไม่พบ หรือสถานะไม่ตรง (service ตัดสินว่าจะตอบผู้ใช้อย่างไร) |
| Pagination | `page` เริ่มที่ 1, `pageSize` ค่าเริ่มต้น 20 สูงสุด 100 |
| Sort | string รูปแบบ `'field:asc'` หรือ `'field:desc'` เช่น `'createdAt:desc'` field ต้องอยู่ใน whitelist ของ model |
| วันเวลา | รับและคืนเป็น JavaScript `Date` เวลาไทย (+07:00) |
| ชนิดข้อมูล | TINYINT(1) → Boolean, DECIMAL → Number, JSON → object |

### config/database.js

สร้าง pool ครั้งเดียวทั้งแอปด้วย `mysql2/promise` ตั้ง `timezone: '+07:00'`, `decimalNumbers: true`, `charset: 'utf8mb4'`, `connectionLimit` จาก .env และ export `pool` กับ `closePool()` (ใช้ตอนปิดแอปหรือจบ test)

### core/db.js

| ฟังก์ชัน | Parameter | Return | ใช้ทำอะไร |
| --- | --- | --- | --- |
| `query(sql, params, options)` | sql: string, params: array, options: `{ conn? }` | rows (array) | รัน SELECT แบบ prepared statement |
| `execute(sql, params, options)` | เหมือน query | `{ insertId, affectedRows }` | รัน INSERT / UPDATE / DELETE |
| `withTransaction(work)` | work: `async (conn) => result` | ค่าที่ `work` คืน | เปิด transaction, commit เมื่อสำเร็จ, rollback เมื่อ throw แล้ว throw ต่อ, คืน connection ให้ pool เสมอ |

### core/mapper.js

| ฟังก์ชัน | ตัวอย่าง |
| --- | --- |
| `toCamel(row, casts?)` | `{ due_at, is_active: 1 }` → `{ dueAt, isActive: true }` |
| `toCamelRows(rows, casts?)` | แปลงทั้ง array |
| `toSnake(data)` | `{ firstName: 'สมชาย' }` → `{ first_name: 'สมชาย' }` |

`casts` คือรายการ field ที่ต้องแปลงชนิด เช่น `{ isActive: 'bool', oldValues: 'json' }` แต่ละ model ประกาศเอง

### core/sqlBuilder.js

| ฟังก์ชัน | ใช้ทำอะไร |
| --- | --- |
| `buildSet(data, writableColumns)` | สร้าง `SET a = ?, b = ?` จาก field ที่อนุญาตให้เขียน, field อื่น throw `INVALID_COLUMN` |
| `buildInsert(data, writableColumns)` | สร้าง `(a, b) VALUES (?, ?)` |
| `buildOrderBy(sort, sortableColumns, defaultSort)` | แปลง `'createdAt:desc'` เป็น `ORDER BY created_at DESC` |
| `buildPaging(page, pageSize)` | คืน `LIMIT ? OFFSET ?` พร้อมค่า และจำกัด pageSize ไม่เกิน 100 |

### core/DbError.js

ทุก error จาก DB ถูกห่อเป็น `DbError` มี `code`, `constraint` (ชื่อ constraint ที่ผิด เช่น `uq_users_email`) และ `cause` (error เดิม ไว้ log เท่านั้น ห้ามส่งให้ผู้ใช้)

| code | เกิดเมื่อ | MySQL/MariaDB errno |
| --- | --- | --- |
| `DUPLICATE` | ค่าซ้ำกับ UNIQUE | 1062 |
| `FK_NOT_FOUND` | อ้างถึง id ที่ไม่มีอยู่ | 1452 |
| `FK_IN_USE` | ลบแถวที่ยังถูกอ้างอิง | 1451 |
| `CHECK_FAILED` | ผิด CHECK constraint | 4025 (MariaDB), 3819 (MySQL) |
| `INVALID_COLUMN` | ส่ง field ที่ไม่อยู่ใน whitelist | – (จาก sqlBuilder) |
| `DB_ERROR` | error อื่นทั้งหมด เช่น เชื่อมต่อไม่ได้ | อื่นๆ |

```js
import { users, DbError } from '../models/index.js';

try {
  await users.insert({ roleId: 2, email: 'a@b.com', /* ... */ });
} catch (err) {
  if (err instanceof DbError && err.code === 'DUPLICATE'
      && err.constraint === 'uq_users_email') {
    // service ตอบผู้ใช้ว่า "อีเมลนี้ถูกใช้แล้ว"
  }
  throw err;
}
```

## Model: ผู้ใช้และสิทธิ์

ทุกฟังก์ชันในหัวข้อนี้และหัวข้อถัดไปรับ `options` (`{ conn?, includeDeleted? }`) เป็น parameter สุดท้าย ตารางด้านล่างจึงไม่เขียนซ้ำ

### roles (roles.model.js)

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id: number | Role \| null |  |
| `findByCode(code)` | code: string | Role \| null | เช่น `'member'` ใช้ตอนสมัครสมาชิก |
| `findAll()` | – | Role\[\] | ข้อมูลน้อย ไม่แบ่งหน้า |
| `insert(data)` | `{ code, name, description? }` | Role |  |
| `update(id, data)` | `{ code?, name?, description? }` | Role \| null |  |
| `hardDelete(id)` | id | boolean | ยังมีผู้ใช้ใน role นี้ → `FK_IN_USE` |

### permissions (permissions.model.js)

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | Permission \| null |  |
| `findByCode(code)` | code: string | Permission \| null |  |
| `findAll(filter?)` | `{ module? }` | Permission\[\] | เรียงตาม module, code |
| `insert(data)` | `{ code, name, module }` | Permission |  |
| `update(id, data)` | `{ code?, name?, module? }` | Permission \| null |  |
| `hardDelete(id)` | id | boolean | ลบการผูกใน role\_permissions อัตโนมัติ (CASCADE) |

### rolePermissions (rolePermissions.model.js)

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findPermissionsByRoleId(roleId)` | roleId | Permission\[\] | ใช้ในหน้าจัดการสิทธิ์ |
| `findPermissionCodesByRoleId(roleId)` | roleId | string\[\] | เช่น `['loan.create', …]` ให้ middleware cache ไว้หลัง login |
| `hasPermission(roleId, code)` | roleId, code: string | boolean |  |
| `add(roleId, permissionId)` | roleId, permissionId | boolean | `false` ถ้าผูกไว้แล้ว (ไม่ throw) |
| `remove(roleId, permissionId)` | roleId, permissionId | boolean |  |
| `replaceForRole(roleId, permissionIds)` | roleId, permissionIds: number\[\] | number (จำนวนสิทธิ์หลังแทนที่) | ลบของเดิมแล้วใส่ใหม่แบบ atomic ถ้าไม่ส่ง `conn` จะเปิด transaction เอง |

### users (users.model.js)

User ที่คืนจากทุกฟังก์ชัน (ยกเว้น `findAuthByEmail`) มี field: `id, roleId, roleCode, roleName, memberCode, email, firstName, lastName, phone, avatarPath, isActive, lastLoginAt, createdAt, updatedAt, deletedAt` ไม่มี `passwordHash`

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | User \| null |  |
| `findByEmail(email)` | email: string | User \| null |  |
| `findByMemberCode(memberCode)` | memberCode: string | User \| null |  |
| `findAuthByEmail(email)` | email: string | `{ id, roleId, roleCode, email, passwordHash, isActive }` \| null | **ใช้กับ login เท่านั้น** ไม่คืนบัญชีที่ถูกลบ |
| `findPasswordHashById(id)` | id | string \| null | ใช้ตรวจรหัสเดิมก่อนเปลี่ยนรหัสผ่าน |
| `list(filter)` | `{ keyword?, roleId?, isActive?, page?, pageSize?, sort? }` | `{ rows: User[], total, page, pageSize }` | keyword ค้นใน ชื่อ, นามสกุล, อีเมล, รหัสสมาชิก, เบอร์โทร · sort ได้: `createdAt, firstName, email, lastLoginAt` |
| `isEmailTaken(email, { excludeId? })` | email, excludeId? | boolean | นับบัญชีที่ soft delete แล้วด้วย (เพราะ UNIQUE) |
| `isMemberCodeTaken(memberCode, { excludeId? })` | memberCode, excludeId? | boolean |  |
| `insert(data)` | `{ roleId, email, passwordHash, firstName, lastName, phone, memberCode?, avatarPath? }` | User | `passwordHash` ต้อง hash มาแล้ว (model ไม่ hash ให้) |
| `update(id, data)` | `{ roleId?, memberCode?, email?, firstName?, lastName?, phone?, avatarPath?, isActive? }` | User \| null | แก้รหัสผ่านที่นี่ไม่ได้ |
| `updatePassword(id, passwordHash)` | id, passwordHash: string | boolean |  |
| `updateLastLogin(id, at?)` | id, at: Date (ค่าเริ่มต้น = ตอนนี้) | boolean |  |
| `softDelete(id)` / `restore(id)` | id | boolean |  |

```js
// ตัวอย่าง: login (ใน service)
const auth = await users.findAuthByEmail(email);
if (!auth || !auth.isActive || !(await bcrypt.compare(password, auth.passwordHash))) {
  // ตอบ "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
}
await users.updateLastLogin(auth.id);
const permissions = await rolePermissions.findPermissionCodesByRoleId(auth.roleId);
```

## Model: อุปกรณ์

### brands (brands.model.js)

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | Brand \| null |  |
| `findByName(name)` | name: string | Brand \| null | ใช้เช็คชื่อซ้ำ (ไม่สนตัวพิมพ์เล็ก-ใหญ่) |
| `findAll()` | – | Brand\[\] | สำหรับ dropdown เรียงตามชื่อ |
| `list(filter)` | `{ keyword?, page?, pageSize?, sort? }` | `{ rows, total, page, pageSize }` | sort ได้: `name, createdAt` |
| `insert(data)` | `{ name }` | Brand |  |
| `update(id, data)` | `{ name? }` | Brand \| null |  |
| `softDelete(id)` / `restore(id)` | id | boolean |  |
| `countActiveModels(brandId)` | brandId | number | ให้ service เช็คก่อนลบยี่ห้อ |

### notebookModels (notebookModels.model.js)

NotebookModel มี field: `id, brandId, brandName, modelName, cpu, ramGb, storageGb, screenInch, os, imagePath, createdAt, updatedAt, deletedAt`

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | NotebookModel \| null | join ชื่อยี่ห้อมาให้ |
| `findByBrandAndName(brandId, modelName)` | brandId, modelName | NotebookModel \| null | เช็ครุ่นซ้ำในยี่ห้อเดียวกัน |
| `list(filter)` | `{ brandId?, keyword?, page?, pageSize?, sort? }` | `{ rows, total, page, pageSize }` | keyword ค้นใน ชื่อรุ่น, CPU · sort ได้: `modelName, brandName, ramGb, createdAt` |
| `insert(data)` | `{ brandId, modelName, cpu, ramGb, storageGb, screenInch, os, imagePath? }` | NotebookModel |  |
| `update(id, data)` | field เดียวกับ insert (ส่งเฉพาะที่แก้) | NotebookModel \| null |  |
| `softDelete(id)` / `restore(id)` | id | boolean |  |
| `countActiveNotebooks(modelId)` | modelId | number | ให้ service เช็คก่อนลบรุ่น |

### notebooks (notebooks.model.js)

Notebook มี field: `id, assetCode, serialNumber, conditionStatus, conditionNote, purchasedAt, currentStatus, modelId, modelName, brandId, brandName, cpu, ramGb, storageGb, screenInch, os, imagePath, createdAt, updatedAt, deletedAt` · `currentStatus` มาจาก View `v_notebook_status` (available / borrowed / reserved / damaged / maintenance / retired)

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | Notebook \| null | รวมสเปกและสถานะปัจจุบัน |
| `findByAssetCode(assetCode)` | assetCode: string | Notebook \| null | ใช้ตอนสแกน barcode |
| `findBySerialNumber(serialNumber)` | serialNumber: string | Notebook \| null | เช็ค serial ซ้ำ |
| `list(filter)` | `{ keyword?, brandId?, modelId?, conditionStatus?, currentStatus?, page?, pageSize?, sort? }` | `{ rows, total, page, pageSize }` | keyword ค้นใน รหัสครุภัณฑ์, serial, รุ่น, ยี่ห้อ · sort ได้: `assetCode, brandName, modelName, purchasedAt, createdAt` |
| `findAvailableInRange(startAt, endAt, { modelId? })` | startAt, endAt: Date | Notebook\[\] | เครื่องสภาพปกติที่ไม่มีการยืมหรือการจองทับช่วงนั้น ใช้ในหน้าค้นหาเพื่อจอง |
| `countOpenCommitments(id)` | id | `{ activeLoans, upcomingReservations }` | ให้ service เช็คก่อนลบหรือปลดระวางเครื่อง |
| `insert(data)` | `{ modelId, assetCode, serialNumber, conditionStatus?, conditionNote?, purchasedAt? }` | Notebook | conditionStatus ค่าเริ่มต้น `'normal'` |
| `update(id, data)` | field เดียวกับ insert (ส่งเฉพาะที่แก้) | Notebook \| null |  |
| `updateCondition(id, conditionStatus, conditionNote?)` | id, conditionStatus, conditionNote | Notebook \| null | ใช้ตอนแอดมินรับคืนแล้วพบว่าเสียหาย |
| `softDelete(id)` / `restore(id)` | id | boolean |  |
| `lockById(id, { conn })` | id, conn **บังคับ** | `{ id, conditionStatus, deletedAt }` \| null | `SELECT … FOR UPDATE` ล็อกแถวเครื่องจน transaction จบ ไม่ส่ง `conn` จะ throw Error ทันที |

## Model: ธุรกรรม

สถานะของการจองและการยืมคำนวณใน SQL ทุกครั้ง (เวลาผ่อนผันอ่านจาก `settings` ใน query เดียวกับ View) ไม่มีฟังก์ชันใดรับหรือเขียนสถานะตรงๆ ฟังก์ชันที่เปลี่ยนสถานะคืน `null` เมื่อแถวไม่อยู่ในสถานะที่ทำได้ เช่น กดคืนซ้ำ

### reservations (reservations.model.js)

Reservation มี field: `id, userId, userFullName, notebookId, assetCode, modelName, startAt, endAt, status, loanId, cancelledAt, cancelledBy, cancelReason, createdAt, updatedAt` · `status` = `upcoming` (รอใช้) / `active` (ถึงเวลาใช้) / `fulfilled` (รับเครื่องแล้ว) / `expired` (ไม่มารับ) / `cancelled`

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | Reservation \| null |  |
| `listByUser(userId, filter)` | userId, `{ status?, page?, pageSize?, sort? }` | `{ rows, total, page, pageSize }` | ประวัติการจองของสมาชิก · sort ได้: `startAt, createdAt` |
| `list(filter)` | `{ userId?, notebookId?, status?, from?, to?, page?, pageSize?, sort? }` | `{ rows, total, page, pageSize }` | สำหรับแอดมิน · from/to กรองตาม startAt |
| `findOverlapping(notebookId, startAt, endAt, { excludeId? })` | notebookId, startAt, endAt: Date | Reservation\[\] | การจองของเครื่องนี้ที่ยังมีผล (ไม่ยกเลิก ไม่หมดอายุ ยังไม่รับเครื่อง) และทับช่วงที่ให้มา ใช้ตอนจอง ยืมทันที และต่อเวลา |
| `findStartingSoon(withinMinutes)` | withinMinutes: number | Reservation\[\] | การจองที่จะเริ่มภายใน X นาทีและยังไม่เคยแจ้งเตือน ให้ scheduled job ใช้ |
| `insert(data)` | `{ userId, notebookId, startAt, endAt }` | Reservation | ช่วงผิด (end ≤ start หรือ > 24 ชม.) → `CHECK_FAILED` |
| `cancel(id, { cancelledBy, reason? })` | id, cancelledBy: userId, reason | Reservation \| null | `null` = ไม่พบ หรือยกเลิกไปแล้ว หรือรับเครื่องไปแล้ว |

### loans (loans.model.js)

Loan มี field: `id, userId, userFullName, notebookId, assetCode, modelName, reservationId, borrowedAt, dueAt, returnRequestedAt, returnedAt, receivedBy, returnCondition, returnNote, cancelledAt, cancelledBy, cancelReason, loanStatus, isLate, createdAt, updatedAt` · `loanStatus` = `borrowing` / `overdue` / `return_pending` / `returned` / `cancelled` (จาก View `v_loans`)

**ค้นหา**

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | Loan \| null |  |
| `listByUser(userId, filter)` | userId, `{ status?, page?, pageSize?, sort? }` | `{ rows, total, page, pageSize }` | ประวัติการยืมของสมาชิก · sort ได้: `borrowedAt, dueAt` |
| `list(filter)` | `{ userId?, notebookId?, status?, isLate?, from?, to?, page?, pageSize?, sort? }` | `{ rows, total, page, pageSize }` | สำหรับแอดมิน · from/to กรองตาม borrowedAt |
| `listPendingReturn(filter)` | `{ page?, pageSize? }` | `{ rows, total, page, pageSize }` | รายการที่สมาชิกกดคืนแล้ว รอแอดมินยืนยัน เรียงจากกดคืนก่อน |
| `findActiveByNotebook(notebookId)` | notebookId | Loan \| null | การยืมที่ยังไม่ได้รับคืนของเครื่องนี้ |
| `countActiveByUser(userId)` | userId | number | จำนวนเครื่องที่สมาชิกยังไม่ได้คืน ให้ service เทียบกับ `max_active_loans_per_user` |
| `findOverlapping(notebookId, startAt, endAt, { excludeId? })` | notebookId, startAt, endAt | Loan\[\] | การยืมที่ยังไม่ได้รับคืนซึ่งช่วง \[borrowedAt, dueAt\] ทับช่วงที่ให้มา ใช้ตอนสร้างการจอง |
| `findDueSoon(withinMinutes)` | withinMinutes: number | Loan\[\] | ยังไม่กดคืน ครบกำหนดภายใน X นาที และยังไม่มีแจ้งเตือนสำหรับ dueAt นี้ |
| `findOverdueWithoutNotice()` | – | Loan\[\] | เกินกำหนด ยังไม่กดคืน และยังไม่มีแจ้งเตือนเกินกำหนดสำหรับ dueAt นี้ |

**เขียน / เปลี่ยนสถานะ**

| ฟังก์ชัน | Parameter | Return | Guard ใน WHERE / หมายเหตุ |
| --- | --- | --- | --- |
| `insert(data)` | `{ userId, notebookId, borrowedAt, dueAt, reservationId? }` | Loan | เครื่องถูกยืมอยู่ → `DUPLICATE` (constraint `uq_loans_active_notebook`) · เกิน 24 ชม. → `CHECK_FAILED` · reservation ไม่ตรงผู้ยืม/เครื่อง → `FK_NOT_FOUND` |
| `extendDueAt(id, newDueAt)` | id, newDueAt: Date | Loan \| null | ยังไม่กดคืน ยังไม่รับคืน ไม่ถูกยกเลิก · รวมเกิน 24 ชม. → `CHECK_FAILED` |
| `requestReturn(id, { at? })` | id, at: Date (ค่าเริ่มต้น = ตอนนี้) | Loan \| null | ยังไม่กดคืน ยังไม่รับคืน ไม่ถูกยกเลิก |
| `confirmReturn(id, { receivedBy, returnCondition, returnNote?, at? })` | id, receivedBy: adminId, returnCondition: `'normal'` \| `'damaged'` | Loan \| null | ยังไม่รับคืน ไม่ถูกยกเลิก (รับคืนได้แม้สมาชิกไม่ได้กดคืน) |
| `cancel(id, { cancelledBy, reason? })` | id, cancelledBy: adminId, reason | Loan \| null | ยังไม่รับคืน ไม่ถูกยกเลิก |

ไม่มี `update` ทั่วไปและไม่มี delete เพื่อให้ประวัติการยืมแก้ได้เฉพาะผ่านขั้นตอนที่กำหนด

## Model: ระบบและรายงาน

### notifications (notifications.model.js)

Notification มี field: `id, type, userId, loanId, reservationId, refDueAt, assetCode, isRead, readAt, createdAt` · `userId` และ `assetCode` หาจากการยืม/การจองที่อ้างถึง (ตารางไม่ได้เก็บ) · ข้อความแจ้งเตือนให้ service สร้างจาก `type`

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `findById(id)` | id | Notification \| null | มี `userId` ให้ service ตรวจ ownership |
| `listByUser(userId, filter)` | userId, `{ unreadOnly?, page?, pageSize? }` | `{ rows, total, page, pageSize }` | ใหม่สุดก่อน |
| `countUnreadByUser(userId)` | userId | number | ตัวเลขบนไอคอนกระดิ่ง |
| `insertIfNotExists(data)` | `{ type, loanId?, reservationId?, refDueAt? }` | Notification \| null | `null` = มีแจ้งเตือนนี้อยู่แล้ว (ไม่ throw) ให้ scheduled job เรียกซ้ำได้ปลอดภัย |
| `markRead(id, userId)` | id, userId | boolean | อ่านได้เฉพาะของเจ้าของ (userId อยู่ใน WHERE) |
| `markAllRead(userId)` | userId | number (จำนวนที่เปลี่ยน) |  |

### settings (settings.model.js)

key ฝั่ง JavaScript เป็น camelCase เช่น `max_loan_hours` → `maxLoanHours` และแปลงค่าตาม `value_type` (int → Number, bool → Boolean)

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `getAll()` | – | `{ maxLoanHours: 24, reservationMaxDaysAhead: 7, … }` | service ควร cache ไว้แล้วล้างเมื่อมีการ set |
| `get(key)` | key: string เช่น `'maxLoanHours'` | number \| boolean \| string \| null |  |
| `listDetailed()` | – | `[{ key, value, valueType, description, updatedBy, updatedAt }]` | สำหรับหน้าตั้งค่าของแอดมิน |
| `set(key, value, { updatedBy })` | key, value, updatedBy: adminId | Setting \| null | `null` = ไม่มี key นี้ (ไม่สร้าง key ใหม่) |

### auditLogs (auditLogs.model.js)

| ฟังก์ชัน | Parameter | Return | คำอธิบาย |
| --- | --- | --- | --- |
| `insert(data)` | `{ action, ipAddress, userId?, targetTable?, targetId?, oldValues?, newValues?, userAgent? }` | number (id) | ลบ key `password`, `passwordHash` ออกจาก old/newValues อัตโนมัติก่อนบันทึก |
| `findById(id)` | id | AuditLog \| null | oldValues, newValues เป็น object |
| `list(filter)` | `{ userId?, action?, targetTable?, targetId?, from?, to?, page?, pageSize? }` | `{ rows, total, page, pageSize }` | ใหม่สุดก่อน |

ไม่มี update และ delete (append-only)

### reports (reports.model.js)

อ่านอย่างเดียวจาก View ส่วนรายงาน "โน๊ตบุ๊คทั้งหมด" ใช้ `notebooks.list()` ได้เลย

| ฟังก์ชัน | Parameter | Return | รายงาน |
| --- | --- | --- | --- |
| `statusSummary()` | – | `{ total, available, borrowed, reserved, damaged, maintenance, retired }` | การ์ดสรุปบน Dashboard |
| `outstandingLoans(filter)` | `{ status?, page?, pageSize? }` | `{ rows: Loan[], total, page, pageSize }` | โน๊ตบุ๊คที่ยังไม่คืน (borrowing, overdue, return\_pending) เกินกำหนดก่อน |
| `availableNotebooks(filter)` | `{ brandId?, modelId?, page?, pageSize? }` | `{ rows: Notebook[], total, page, pageSize }` | โน๊ตบุ๊คที่ว่างตอนนี้ |
| `monthlyLoans({ fromMonth, toMonth })` | fromMonth, toMonth: `'YYYY-MM'` | `[{ loanMonth, totalLoans, lateLoans }]` | จำนวนการยืมต่อเดือน คืนเฉพาะเดือนที่มีข้อมูล (เดือนที่เป็น 0 ให้ service เติม) |

## ตัวอย่างการใช้งานใน Transaction

ตัวอย่างนี้แสดงว่า service จะเรียก model อย่างไรในงานที่ต้องเป็น transaction เดียว โค้ด service จริงจะทำในรอบถัดไป ส่วนที่เป็นกฎธุรกิจ (คอมเมนต์ "service ตัดสิน") อยู่ฝั่ง service ทั้งหมด

**ยืมทันที:** ล็อกเครื่องก่อน ทำให้คำขอยืมเครื่องเดียวกันพร้อมกันต้องรอคิว

```js
import { withTransaction, notebooks, loans, reservations, settings, auditLogs } from '../models/index.js';

const loan = await withTransaction(async (conn) => {
  const nb = await notebooks.lockById(notebookId, { conn });
  // service ตัดสิน: nb ต้องมีอยู่, conditionStatus = 'normal', ไม่ถูกลบ

  const maxLoans = await settings.get('maxActiveLoansPerUser', { conn });
  const active = await loans.countActiveByUser(userId, { conn });
  // service ตัดสิน: active < maxLoans

  const clashes = await reservations.findOverlapping(notebookId, now, dueAt, { conn });
  // service ตัดสิน: ห้ามทับการจองของคนอื่น

  const created = await loans.insert({ userId, notebookId, borrowedAt: now, dueAt }, { conn });
  await auditLogs.insert({ userId, action: 'CREATE', targetTable: 'loans',
                           targetId: created.id, newValues: created, ipAddress }, { conn });
  return created;
});
```

**แอดมินรับคืนและพบว่าเครื่องเสีย:** อัปเดต 2 ตารางพร้อมกัน ถ้าอันใดล้มจะ rollback ทั้งคู่

```js
await withTransaction(async (conn) => {
  const loan = await loans.confirmReturn(loanId,
    { receivedBy: adminId, returnCondition: 'damaged', returnNote: 'จอแตกมุมขวา' }, { conn });
  if (!loan) throw new Error('LOAN_NOT_OPEN');   // service แปลงเป็นข้อความให้ผู้ใช้

  await notebooks.updateCondition(loan.notebookId, 'damaged', 'จอแตกมุมขวา', { conn });
});
```

**ต่อเวลา:** เช็คว่าช่วงที่ขอต่อไม่ทับการจองของคนอื่น แล้วเลื่อน dueAt

```js
await withTransaction(async (conn) => {
  const current = await loans.findById(loanId, { conn });
  await notebooks.lockById(current.notebookId, { conn });
  const clashes = await reservations.findOverlapping(current.notebookId, current.dueAt, newDueAt, { conn });
  // service ตัดสิน: เป็นของผู้ยืมเอง, ยังไม่เกินกำหนด, clashes ต้องว่าง
  return loans.extendDueAt(loanId, newDueAt, { conn });  // เกิน 24 ชม. → DbError CHECK_FAILED
});
```

## การทดสอบ

ทดสอบกับฐานข้อมูลจริงแยกชื่อ `notebook_loan_test` (สร้างจาก `notebook_loan.sql` เดิม) ด้วย `node:test` ที่มากับ Node.js แต่ละ test ทำงานใน transaction แล้ว rollback ตอนจบ ข้อมูลจึงสะอาดทุกครั้งและไม่ต้องลบเอง

```bash
npm test                                  # รันทุก test
node --test tests/models/loans.test.js    # รันเฉพาะ model เดียว
```

| กลุ่ม test | สิ่งที่ตรวจ |
| --- | --- |
| ปกติ | insert แล้ว find กลับได้ค่าเดิม, update เฉพาะ field ที่ส่ง, list แบ่งหน้าและนับ total ถูก, sort ถูกทิศ |
| ไม่พบข้อมูล | find คืน `null`, update/softDelete คืน `null`/`false` |
| Soft delete | แถวที่ลบไม่ออกใน find/list, `includeDeleted: true` เห็น, restore แล้วกลับมา |
| Error | ค่าซ้ำ → `DUPLICATE`, id ไม่มีจริง → `FK_NOT_FOUND`, ลบแถวที่ถูกอ้าง → `FK_IN_USE`, ผิด CHECK → `CHECK_FAILED`, field แปลก → `INVALID_COLUMN` |
| ความปลอดภัย | ส่ง `"1 OR 1=1"` และ `"'; DROP TABLE users;--"` เป็นค่าแล้วไม่เกิดผล, sort ที่ไม่อยู่ใน whitelist ถูกปฏิเสธ, ไม่มี `passwordHash` ใน users.findById/list |
| ช่วงเวลา (reservations, loans) | ทับบางส่วนซ้าย/ขวา, ครอบทั้งช่วง, อยู่ข้างใน, ชนขอบพอดี (end = start ไม่นับว่าทับ), การจองที่ยกเลิก/หมดอายุ/รับเครื่องแล้วไม่นับ |
| Guard สถานะ | กดคืนซ้ำคืน `null`, ยกเลิกรายการที่รับคืนแล้วคืน `null`, ต่อเวลาหลังกดคืนคืน `null` |
| Transaction | throw ใน `withTransaction` แล้วข้อมูลไม่ถูกบันทึก, `lockById` ทำให้ transaction ที่สองรอจนตัวแรก commit |
| ชนิดข้อมูล | Date เป็น `Date`, `isActive`/`isLate` เป็น Boolean, `screenInch` เป็น Number, JSON ใน audit log เป็น object |

## สิ่งที่ต้อง Approve

เมื่อ approve ครบ จะเริ่มเขียนโค้ดตั้งแต่ขั้นที่ 1 และส่งให้ตรวจทีละขั้น

- [ ] รายชื่อฟังก์ชันของแต่ละ model ครบตามที่ต้องใช้ (ถ้ามีหน้าจอหรืองานที่ต้องการ query เพิ่ม แจ้งได้เลย)
- [ ] รูปแบบ return: ไม่พบคืน `null`, list คืน `{ rows, total, page, pageSize }`, error เป็น `DbError`
- [ ] ใช้ `mysql2` + `dotenv` เท่านั้น และทดสอบด้วย `node:test` ที่มากับ Node.js 20+
- [ ] สร้างฐานข้อมูลทดสอบ `notebook_loan_test` แยกจากฐานข้อมูลใช้งาน (test helper จะ import `notebook_loan.sql` โดยเปลี่ยนชื่อฐานข้อมูลให้เอง)
- [ ] การจองและการยืมไม่มี `update` ทั่วไปและไม่มี delete แก้ได้เฉพาะผ่านฟังก์ชันเปลี่ยนสถานะ
- [ ] การแก้ role/permission ทำผ่าน DB หรือ seed เท่านั้นในเวอร์ชันแรก (มีฟังก์ชันให้ แต่ยังไม่มีหน้าจอ)
