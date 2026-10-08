# HTTP API Specification – ระบบยืมคืนโน๊ตบุ๊ค

Oct 8, 2026 · Phase 2 Design API (สัญญาระหว่าง Frontend และ Backend)
อ้างอิง: `requirement-summary.md`, `Model Layer.md`, `business-logic-plan.md`

> เอกสารนี้กำหนดรูปแบบ request/response ที่ frontend เรียกใช้ ทุก endpoint ผูกกับฟังก์ชันใน service layer (คอลัมน์ "Service") ส่วน route และ controller จะเขียนในรอบถัดไปตามเอกสารนี้

---

## 1. ข้อตกลงทั่วไป

| เรื่อง | ข้อตกลง |
| --- | --- |
| Base URL | `http://localhost:3000/api/v1` (port **[สมมติฐาน]**) |
| รูปแบบข้อมูล | JSON · `Content-Type: application/json; charset=utf-8` |
| อัปโหลดรูป | `multipart/form-data` field ชื่อ `image` (เฉพาะ endpoint ที่ระบุ) jpg/png/webp ไม่เกิน 2 MB **[สมมติฐาน]** |
| Authentication | `Authorization: Bearer <JWT>` ทุก endpoint ยกเว้นที่ระบุว่า Public |
| ชื่อ field | camelCase |
| วันเวลา | ISO 8601 พร้อม offset เวลาไทย เช่น `2026-10-08T14:30:00+07:00` · รับแบบ `Z` (UTC) ได้ ระบบแปลงให้ |
| เดือน | `YYYY-MM` |
| ภาษาข้อความ | ภาษาไทย (`error.message`) frontend แสดงได้เลย |

### 1.1 รูปแบบ Response

**สำเร็จ (1 รายการ)**

```json
{ "success": true, "data": { "id": 12, "...": "..." } }
```

**สำเร็จ (รายการแบ่งหน้า)**

```json
{
  "success": true,
  "data": [ { "id": 1 }, { "id": 2 } ],
  "meta": { "page": 1, "pageSize": 20, "total": 57, "totalPages": 3 }
}
```

**ไม่สำเร็จ**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ข้อมูลไม่ถูกต้อง",
    "details": [ { "field": "dueAt", "message": "กำหนดคืนต้องไม่เกิน 24 ชั่วโมงนับจากตอนนี้" } ]
  }
}
```

frontend ใช้ `error.code` ตัดสินใจ (เช่น แสดงปุ่ม "ไปที่การจองของฉัน" เมื่อได้ `OWN_RESERVATION_OVERLAP`) และแสดง `error.message` ให้ผู้ใช้ · ไม่มี stack trace ใน response

### 1.2 Pagination, Sort, Filter

| Query | ค่าเริ่มต้น | หมายเหตุ |
| --- | --- | --- |
| `page` | 1 | ≥ 1 |
| `pageSize` | 20 | 1–100 |
| `sort` | แล้วแต่ endpoint | รูปแบบ `field:asc` หรือ `field:desc` field ต้องอยู่ในรายการที่ endpoint ระบุ |
| `keyword` | – | ค้นหาข้อความ |

### 1.3 HTTP Status ที่ใช้

| Status | ความหมาย |
| --- | --- |
| 200 | สำเร็จ |
| 201 | สร้างข้อมูลใหม่สำเร็จ |
| 400 | input ไม่ถูกต้อง (`VALIDATION_ERROR` และกฎช่วงเวลา) |
| 401 | ไม่ได้ login, token ผิด หรือหมดอายุ |
| 403 | login แล้วแต่ไม่มีสิทธิ์ |
| 404 | ไม่พบข้อมูล หรือเป็นข้อมูลของคนอื่น |
| 409 | ขัดกับสถานะปัจจุบัน (เครื่องถูกยืม, ช่วงเวลาทับ, ข้อมูลซ้ำ) |
| 422 | ผิดกฎธุรกิจ (เกินโควตา, เกิน 24 ชม.) |
| 500 | ข้อผิดพลาดภายในระบบ |

---

## 2. สรุป Endpoint ทั้งหมด

สิทธิ์: **Public** = ไม่ต้อง login · **Auth** = login แล้วทุก role · **Member** / **Admin** = ตาม permission ใน `business-logic-plan.md` ข้อ 3.3

| # | Method | Path | สิทธิ์ | Service |
| --- | --- | --- | --- | --- |
| **Auth** |
| A1 | POST | `/auth/register` | Public | auth.register |
| A2 | POST | `/auth/login` | Public | auth.login |
| A3 | POST | `/auth/logout` | Auth | auth.logout |
| **ข้อมูลของฉัน** |
| M1 | GET | `/me` | Auth | profile.getMe |
| M2 | PATCH | `/me` | Auth | profile.updateMe |
| M3 | POST | `/me/avatar` | Auth | profile.updateMe (avatarPath) |
| M4 | PUT | `/me/password` | Auth | profile.changePassword |
| M5 | GET | `/me/loans` | Auth | loans.listMine |
| M6 | GET | `/me/reservations` | Auth | reservations.listMine |
| M7 | GET | `/me/notifications` | Auth | notifications.listMine |
| M8 | GET | `/me/notifications/unread-count` | Auth | notifications.countUnread |
| M9 | PATCH | `/me/notifications/:id/read` | Auth | notifications.markRead |
| M10 | PATCH | `/me/notifications/read-all` | Auth | notifications.markAllRead |
| **ค่าตั้งค่า** |
| S1 | GET | `/settings/public` | Auth | settings.getPublic |
| S2 | GET | `/settings` | Admin `setting.manage` | settings.listDetailed |
| S3 | PATCH | `/settings` | Admin `setting.manage` | settings.update |
| **ยี่ห้อ** |
| B1 | GET | `/brands/options` | Auth `notebook.view` | brands.listBrandOptions |
| B2 | GET | `/brands` | Admin `catalog.manage` | brands.listBrands |
| B3 | POST | `/brands` | Admin `catalog.manage` | brands.createBrand |
| B4 | PATCH | `/brands/:id` | Admin `catalog.manage` | brands.updateBrand |
| B5 | DELETE | `/brands/:id` | Admin `catalog.manage` | brands.deleteBrand |
| B6 | POST | `/brands/:id/restore` | Admin `catalog.manage` | brands.restoreBrand |
| **รุ่น** |
| D1 | GET | `/notebook-models` | Auth `notebook.view` | notebookModels.listModels |
| D2 | GET | `/notebook-models/:id` | Auth `notebook.view` | notebookModels.getById |
| D3 | POST | `/notebook-models` | Admin `catalog.manage` | notebookModels.createModel |
| D4 | PATCH | `/notebook-models/:id` | Admin `catalog.manage` | notebookModels.updateModel |
| D5 | POST | `/notebook-models/:id/image` | Admin `catalog.manage` | notebookModels.updateModel (imagePath) |
| D6 | DELETE | `/notebook-models/:id` | Admin `catalog.manage` | notebookModels.deleteModel |
| D7 | POST | `/notebook-models/:id/restore` | Admin `catalog.manage` | notebookModels.restoreModel |
| **โน๊ตบุ๊ค** |
| N1 | GET | `/notebooks` | Auth `notebook.view` | notebooks.list |
| N2 | GET | `/notebooks/available` | Auth `notebook.view` | notebooks.searchAvailable |
| N3 | GET | `/notebooks/by-asset/:assetCode` | Auth `notebook.view` | notebooks.getByAssetCode |
| N4 | GET | `/notebooks/:id` | Auth `notebook.view` | notebooks.getById |
| N5 | POST | `/notebooks` | Admin `catalog.manage` | notebooks.create |
| N6 | PATCH | `/notebooks/:id` | Admin `catalog.manage` | notebooks.update |
| N7 | DELETE | `/notebooks/:id` | Admin `catalog.manage` | notebooks.delete |
| N8 | POST | `/notebooks/:id/restore` | Admin `catalog.manage` | notebooks.restore |
| **การยืม** |
| L1 | POST | `/loans` | Member `loan.create` | loans.borrowNow |
| L2 | GET | `/loans/:id` | เจ้าของ หรือ Admin `loan.view_all` | loans.getById |
| L3 | POST | `/loans/:id/extend` | Member `loan.extend` (เจ้าของ) | loans.extend |
| L4 | POST | `/loans/:id/return-request` | Member `loan.return` (เจ้าของ) | loans.requestReturn |
| L5 | GET | `/loans` | Admin `loan.view_all` | loans.listAll |
| L6 | GET | `/loans/pending-return` | Admin `loan.confirm_return` | loans.listPendingReturn |
| L7 | POST | `/loans/:id/confirm-return` | Admin `loan.confirm_return` | loans.confirmReturn |
| L8 | POST | `/loans/:id/cancel` | Admin `loan.cancel` | loans.cancel |
| **การจอง** |
| R1 | POST | `/reservations` | Member `reservation.create` | reservations.create |
| R2 | GET | `/reservations/:id` | เจ้าของ หรือ Admin `reservation.view_all` | reservations.getById |
| R3 | POST | `/reservations/:id/pickup` | Member `loan.create` (เจ้าของ) | loans.pickupReservation |
| R4 | POST | `/reservations/:id/cancel` | เจ้าของ หรือ Admin `reservation.cancel_any` | reservations.cancel |
| R5 | GET | `/reservations` | Admin `reservation.view_all` | reservations.listAll |
| **สมาชิก (แอดมิน)** |
| U1 | GET | `/users` | Admin `user.manage` | users.list |
| U2 | GET | `/users/:id` | Admin `user.manage` | users.getById |
| U3 | PATCH | `/users/:id` | Admin `user.manage` | users.update |
| U4 | POST | `/users/:id/suspend` | Admin `user.manage` | users.suspend |
| U5 | POST | `/users/:id/activate` | Admin `user.manage` | users.activate |
| U6 | DELETE | `/users/:id` | Admin `user.manage` | users.delete |
| U7 | POST | `/users/:id/restore` | Admin `user.manage` | users.restore |
| **รายงาน** |
| P1 | GET | `/reports/summary` | Admin `report.view` | reports.summary |
| P2 | GET | `/reports/notebooks` | Admin `report.view` | reports.allNotebooks |
| P3 | GET | `/reports/outstanding-loans` | Admin `report.view` | reports.outstandingLoans |
| P4 | GET | `/reports/available-notebooks` | Admin `report.view` | reports.availableNotebooks |
| P5 | GET | `/reports/monthly-loans` | Admin `report.view` | reports.monthlyLoans |
| **Audit Log** |
| G1 | GET | `/audit-logs` | Admin `audit.view` | auditLogs.list |
| G2 | GET | `/audit-logs/:id` | Admin `audit.view` | auditLogs.getById |

> ลำดับ route: ต้องประกาศ `/notebooks/available`, `/notebooks/by-asset/:assetCode`, `/loans/pending-return` **ก่อน** route ที่มี `/:id` ไม่งั้น Express จะจับเป็น id

---

## 3. Data Objects

### User

```json
{
  "id": 15,
  "roleCode": "member",
  "roleName": "สมาชิก",
  "memberCode": "6501234",
  "email": "somchai@example.com",
  "firstName": "สมชาย",
  "lastName": "ใจดี",
  "phone": "0812345678",
  "avatarUrl": "/uploads/avatars/15.webp",
  "isActive": true,
  "lastLoginAt": "2026-10-08T08:15:00+07:00",
  "createdAt": "2026-09-01T10:00:00+07:00"
}
```

แอดมินเห็นเพิ่ม: `roleId`, `updatedAt`, `deletedAt`, และใน U2 มี `activeLoanCount`

### Notebook

สมาชิกเห็น:

```json
{
  "id": 7,
  "assetCode": "NB-2025-0007",
  "currentStatus": "available",
  "brandName": "Lenovo",
  "modelName": "ThinkPad E14 Gen 5",
  "cpu": "Intel Core i5-1335U",
  "ramGb": 16,
  "storageGb": 512,
  "screenInch": 14.0,
  "os": "Windows 11 Pro",
  "imageUrl": "/uploads/models/3.webp"
}
```

แอดมินเห็นเพิ่ม: `modelId`, `brandId`, `serialNumber`, `conditionStatus`, `conditionNote`, `purchasedAt`, `createdAt`, `updatedAt`, `deletedAt`

| `currentStatus` | ข้อความไทย | | `conditionStatus` | ข้อความไทย |
| --- | --- | --- | --- | --- |
| `available` | ว่าง | | `normal` | ปกติ |
| `borrowed` | ถูกยืม | | `damaged` | เสียหาย |
| `reserved` | ถูกจอง | | `maintenance` | ซ่อมบำรุง |
| `damaged` | เสียหาย | | `retired` | ปลดระวาง |
| `maintenance` | ซ่อมบำรุง | | | |
| `retired` | ปลดระวาง | | | |

### NotebookModel

```json
{
  "id": 3, "brandId": 1, "brandName": "Lenovo", "modelName": "ThinkPad E14 Gen 5",
  "cpu": "Intel Core i5-1335U", "ramGb": 16, "storageGb": 512, "screenInch": 14.0,
  "os": "Windows 11 Pro", "imageUrl": "/uploads/models/3.webp"
}
```

### Loan

```json
{
  "id": 120,
  "userId": 15,
  "userFullName": "สมชาย ใจดี",
  "notebookId": 7,
  "assetCode": "NB-2025-0007",
  "modelName": "ThinkPad E14 Gen 5",
  "reservationId": null,
  "borrowedAt": "2026-10-08T09:00:00+07:00",
  "dueAt": "2026-10-08T17:00:00+07:00",
  "returnRequestedAt": null,
  "returnedAt": null,
  "receivedBy": null,
  "returnCondition": null,
  "returnNote": null,
  "cancelledAt": null,
  "cancelReason": null,
  "loanStatus": "borrowing",
  "isLate": false,
  "actions": {
    "canExtend": true,
    "maxExtendDueAt": "2026-10-09T09:00:00+07:00",
    "canRequestReturn": true
  }
}
```

`actions` มีเฉพาะใน L2 และ response ของ L1, L3, L4, R3 ใช้เปิด/ปิดปุ่มใน UI (backend ยังตรวจกฎซ้ำทุกครั้ง)

| `loanStatus` | ข้อความไทย |
| --- | --- |
| `borrowing` | กำลังยืม |
| `overdue` | เกินกำหนด |
| `return_pending` | รอยืนยันรับคืน |
| `returned` | คืนแล้ว |
| `cancelled` | ยกเลิก |

`isLate: true` แสดงป้าย "คืนช้า"

### Reservation

```json
{
  "id": 44,
  "userId": 15,
  "userFullName": "สมชาย ใจดี",
  "notebookId": 7,
  "assetCode": "NB-2025-0007",
  "modelName": "ThinkPad E14 Gen 5",
  "startAt": "2026-10-10T09:00:00+07:00",
  "endAt": "2026-10-10T16:00:00+07:00",
  "pickupDeadline": "2026-10-10T09:30:00+07:00",
  "status": "upcoming",
  "loanId": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-10-08T10:12:00+07:00"
}
```

`pickupDeadline` = `startAt + reservationGraceMinutes` (service คำนวณให้)

| `status` | ข้อความไทย |
| --- | --- |
| `upcoming` | รอใช้ |
| `active` | ถึงเวลาใช้ (กดรับเครื่องได้) |
| `fulfilled` | รับเครื่องแล้ว |
| `expired` | หมดอายุ (ไม่มารับ) |
| `cancelled` | ยกเลิก |

### Notification

```json
{
  "id": 301,
  "type": "loan_due_soon",
  "title": "ใกล้ครบกำหนดคืน",
  "message": "เครื่อง NB-2025-0007 ครบกำหนดคืนเวลา 17:00 น.",
  "loanId": 120,
  "reservationId": null,
  "isRead": false,
  "createdAt": "2026-10-08T16:00:00+07:00"
}
```

---

## 4. รายละเอียด Endpoint

รูปแบบ: ทุก endpoint ที่ต้อง login อาจได้ `401 UNAUTHORIZED` และ endpoint ของแอดมินอาจได้ `403 FORBIDDEN` จึงไม่เขียนซ้ำในแต่ละหัวข้อ · input ที่ผิดรูปแบบได้ `400 VALIDATION_ERROR` เสมอ

### 4.1 Auth

#### A1 `POST /auth/register` — สมัครสมาชิก

```json
{
  "email": "somchai@example.com",
  "password": "Passw0rd",
  "firstName": "สมชาย",
  "lastName": "ใจดี",
  "phone": "0812345678",
  "memberCode": "6501234"
}
```

| Field | กฎ |
| --- | --- |
| email | บังคับ รูปแบบอีเมล ≤ 255 |
| password | บังคับ ≥ 8 ตัว มีตัวอักษรและตัวเลข |
| firstName, lastName | บังคับ 1–100 ตัว |
| phone | บังคับ ขึ้นต้น 0 ตามด้วย 9 หลัก |
| memberCode | ไม่บังคับ 1–30 ตัว |

**201** → `{ token, expiresAt, user: User, permissions: string[] }` (ใช้งานได้ทันที ไม่ต้อง login ซ้ำ)
**Error:** 409 `EMAIL_TAKEN`, 409 `MEMBER_CODE_TAKEN`

#### A2 `POST /auth/login`

```json
{ "email": "somchai@example.com", "password": "Passw0rd" }
```

**200**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "expiresAt": "2026-10-08T17:15:00+07:00",
    "user": { "id": 15, "roleCode": "member", "firstName": "สมชาย", "...": "..." },
    "permissions": ["notebook.view", "loan.create", "loan.extend", "loan.return", "reservation.create"]
  }
}
```

**Error:** 401 `INVALID_CREDENTIALS` (อีเมลผิดหรือรหัสผิดได้ข้อความเดียวกัน), 403 `ACCOUNT_SUSPENDED`

frontend ใช้ `roleCode` เลือกหน้าแรก และใช้ `permissions` ซ่อน/แสดงเมนู

#### A3 `POST /auth/logout`

ไม่มี body · **200** `{ "success": true, "data": null }` แล้ว frontend ลบ token ที่เก็บไว้

### 4.2 ข้อมูลของฉัน

#### M1 `GET /me`

**200** → `User` + `permissions` (ใช้ตอนเปิดแอปเพื่อตรวจว่า token ยังใช้ได้)

#### M2 `PATCH /me`

```json
{ "firstName": "สมชาย", "lastName": "ใจดีมาก", "phone": "0899999999" }
```

ส่งเฉพาะ field ที่แก้ (แก้ได้ `firstName`, `lastName`, `phone`) · **200** → `User`

#### M3 `POST /me/avatar`

`multipart/form-data` field `image` · **200** → `User` (มี `avatarUrl` ใหม่)
**Error:** 400 `INVALID_FILE` (ชนิดหรือขนาดไม่ถูก)

#### M4 `PUT /me/password`

```json
{ "currentPassword": "Passw0rd", "newPassword": "NewPassw0rd" }
```

**200** `data: null` · **Error:** 400 `CURRENT_PASSWORD_INCORRECT`, 400 `VALIDATION_ERROR` (รหัสใหม่ไม่ตามนโยบายหรือซ้ำรหัสเดิม)

#### M5 `GET /me/loans`

Query: `status` (`borrowing|overdue|return_pending|returned|cancelled`), `page`, `pageSize`, `sort` (`borrowedAt`, `dueAt` · ค่าเริ่มต้น `borrowedAt:desc`)
**200** → `Loan[]` + meta

#### M6 `GET /me/reservations`

Query: `status`, `page`, `pageSize`, `sort` (`startAt`, `createdAt` · ค่าเริ่มต้น `startAt:desc`)
**200** → `Reservation[]` + meta

#### M7 `GET /me/notifications`

Query: `unreadOnly` (`true|false`), `page`, `pageSize` · **200** → `Notification[]` + meta (ใหม่สุดก่อน)

#### M8 `GET /me/notifications/unread-count`

**200** → `{ "count": 3 }` (frontend เรียกทุก 60 วินาที หรือเมื่อเปลี่ยนหน้า **[สมมติฐาน]**)

#### M9 `PATCH /me/notifications/:id/read`

**200** `data: null` · **Error:** 404 `NOTIFICATION_NOT_FOUND`

#### M10 `PATCH /me/notifications/read-all`

**200** → `{ "updated": 3 }`

### 4.3 ค่าตั้งค่า

#### S1 `GET /settings/public`

**200**

```json
{ "maxLoanHours": 24, "reservationMaxDaysAhead": 7, "reservationGraceMinutes": 30, "maxActiveLoansPerUser": 1 }
```

ใช้จำกัดตัวเลือกวันเวลาในฟอร์มยืม/จอง/ต่อเวลา

#### S2 `GET /settings`

**200** → `[{ key, value, valueType, description, updatedBy, updatedAt }]`

#### S3 `PATCH /settings`

```json
{ "maxLoanHours": 12, "notifyBeforeDueMinutes": 30 }
```

| key | ช่วงที่ยอมรับ |
| --- | --- |
| maxLoanHours | 1–24 |
| reservationMaxDaysAhead | 1–30 |
| reservationGraceMinutes | 5–120 |
| notifyBeforeDueMinutes | 5–240 |
| maxActiveLoansPerUser | 1–5 |

บันทึกทุก key ในครั้งเดียว (ผิด 1 ตัว ไม่บันทึกเลย) · **200** → รายการแบบ S2
**Error:** 400 `UNKNOWN_SETTING`, 400 `VALIDATION_ERROR`

### 4.4 ยี่ห้อ

| Endpoint | Request | Response | Error |
| --- | --- | --- | --- |
| B1 `GET /brands/options` | – | `[{ id, name }]` เรียงตามชื่อ | – |
| B2 `GET /brands` | `keyword, page, pageSize, sort (name, createdAt), includeDeleted` | `Brand[]` + meta | – |
| B3 `POST /brands` | `{ "name": "Lenovo" }` | **201** `Brand` | 409 `BRAND_NAME_TAKEN` |
| B4 `PATCH /brands/:id` | `{ "name": "LENOVO" }` | `Brand` | 404 `BRAND_NOT_FOUND`, 409 `BRAND_NAME_TAKEN` |
| B5 `DELETE /brands/:id` | – | `data: null` | 404 `BRAND_NOT_FOUND`, 409 `BRAND_IN_USE` (`details.activeModels`) |
| B6 `POST /brands/:id/restore` | – | `Brand` | 404 `BRAND_NOT_FOUND` |

`Brand` = `{ id, name, createdAt, updatedAt, deletedAt }`

### 4.5 รุ่น

| Endpoint | Request | Response | Error |
| --- | --- | --- | --- |
| D1 `GET /notebook-models` | `brandId, keyword, page, pageSize, sort (modelName, brandName, ramGb, createdAt)` | `NotebookModel[]` + meta | – |
| D2 `GET /notebook-models/:id` | – | `NotebookModel` | 404 `MODEL_NOT_FOUND` |
| D3 `POST /notebook-models` | ตัวอย่างด้านล่าง | **201** `NotebookModel` | 404 `BRAND_NOT_FOUND`, 409 `MODEL_NAME_TAKEN` |
| D4 `PATCH /notebook-models/:id` | field เดียวกับ D3 (ส่งเฉพาะที่แก้) | `NotebookModel` | 404 `MODEL_NOT_FOUND`, 409 `MODEL_NAME_TAKEN` |
| D5 `POST /notebook-models/:id/image` | multipart `image` | `NotebookModel` | 400 `INVALID_FILE` |
| D6 `DELETE /notebook-models/:id` | – | `data: null` | 409 `MODEL_IN_USE` (`details.activeNotebooks`) |
| D7 `POST /notebook-models/:id/restore` | – | `NotebookModel` | 404 `BRAND_NOT_FOUND` (ยี่ห้อถูกลบอยู่) |

```json
{
  "brandId": 1, "modelName": "ThinkPad E14 Gen 5", "cpu": "Intel Core i5-1335U",
  "ramGb": 16, "storageGb": 512, "screenInch": 14.0, "os": "Windows 11 Pro"
}
```

กฎ: `ramGb` 1–256, `storageGb` 1–8192, `screenInch` 10.0–18.0, ข้อความ 1–100 ตัว

### 4.6 โน๊ตบุ๊ค

#### N1 `GET /notebooks` — ค้นหาเครื่อง

Query: `keyword` (รหัสครุภัณฑ์, serial, รุ่น, ยี่ห้อ), `brandId`, `modelId`, `currentStatus`, `page`, `pageSize`, `sort` (`assetCode, brandName, modelName, purchasedAt, createdAt`)
แอดมินส่งเพิ่มได้: `conditionStatus`, `includeDeleted`
**200** → `Notebook[]` + meta (field ตาม role)

#### N2 `GET /notebooks/available` — หาเครื่องว่างสำหรับจอง

Query: `startAt`, `endAt` (บังคับ), `modelId`
**200** → `Notebook[]` · **Error:** 400 `INVALID_TIME_RANGE`, 400 `RESERVATION_TOO_FAR_AHEAD`

#### N3 `GET /notebooks/by-asset/:assetCode` — สแกน barcode

**200** → `Notebook` (แอดมินได้ `activeLoan` เพิ่ม เพื่อกดรับคืนต่อได้ทันที) · **Error:** 404 `NOTEBOOK_NOT_FOUND`

#### N4 `GET /notebooks/:id`

**200** → `Notebook` · แอดมินได้เพิ่ม `activeLoan: Loan | null` และ `upcomingReservations: Reservation[]`
**Error:** 404 `NOTEBOOK_NOT_FOUND`

#### N5 `POST /notebooks`

```json
{
  "modelId": 3, "assetCode": "NB-2025-0007", "serialNumber": "PF4ABCDE",
  "conditionStatus": "normal", "conditionNote": null, "purchasedAt": "2025-06-15"
}
```

**201** → `Notebook` · **Error:** 404 `MODEL_NOT_FOUND`, 409 `ASSET_CODE_TAKEN`, 409 `SERIAL_NUMBER_TAKEN`

#### N6 `PATCH /notebooks/:id`

field เดียวกับ N5 (ส่งเฉพาะที่แก้)
**200**

```json
{
  "success": true,
  "data": {
    "notebook": { "id": 7, "conditionStatus": "maintenance", "...": "..." },
    "warnings": { "affectedReservations": [ { "id": 44, "startAt": "...", "userFullName": "..." } ] }
  }
}
```

`warnings.affectedReservations` มีค่าเมื่อเปลี่ยนเป็น `damaged`/`maintenance` แล้วมีการจองในอนาคต (frontend ควรถามแอดมินว่าจะยกเลิกการจองเหล่านั้นไหม แล้วเรียก R4)
**Error:** 404 `NOTEBOOK_NOT_FOUND`, 409 `ASSET_CODE_TAKEN`, 409 `SERIAL_NUMBER_TAKEN`, 409 `NOTEBOOK_HAS_COMMITMENTS` (เปลี่ยนเป็น `retired` ขณะมีการยืม/จองค้าง)

#### N7 `DELETE /notebooks/:id`

**200** `data: null` · **Error:** 409 `NOTEBOOK_HAS_COMMITMENTS` (`details: { activeLoans, upcomingReservations }`)

#### N8 `POST /notebooks/:id/restore`

**200** → `Notebook`

### 4.7 การยืม

#### L1 `POST /loans` — ยืมทันที

```json
{ "notebookId": 7, "dueAt": "2026-10-08T17:00:00+07:00" }
```

หรือส่ง `"assetCode": "NB-2025-0007"` แทน `notebookId` (จากการสแกน)

| กฎ | Error |
| --- | --- |
| เครื่องต้องมีอยู่ | 404 `NOTEBOOK_NOT_FOUND` |
| สภาพเครื่องปกติ | 409 `NOTEBOOK_NOT_AVAILABLE` |
| ไม่มีคนยืมอยู่ | 409 `NOTEBOOK_ALREADY_BORROWED` |
| `dueAt` อยู่ในอนาคต และไม่เกิน `maxLoanHours` นับจากตอนนี้ | 400 `INVALID_DUE_AT` |
| ยืมค้างไม่เกิน `maxActiveLoansPerUser` | 422 `LOAN_LIMIT_REACHED` |
| ไม่ทับการจองของคนอื่น | 409 `RESERVATION_CONFLICT` (`details.availableUntil`) |
| ไม่ทับการจองของตัวเอง | 409 `OWN_RESERVATION_OVERLAP` (`details.reservationId`) |

**201** → `Loan`

#### L2 `GET /loans/:id`

**200** → `Loan` (มี `actions`) · **Error:** 404 `LOAN_NOT_FOUND`

#### L3 `POST /loans/:id/extend` — ต่อเวลา

```json
{ "newDueAt": "2026-10-08T21:00:00+07:00" }
```

| กฎ | Error |
| --- | --- |
| เป็นของตัวเอง | 404 `LOAN_NOT_FOUND` |
| สถานะ `borrowing` (ยังไม่กดคืน) | 409 `LOAN_NOT_ACTIVE` |
| ยังไม่เกินกำหนด | 409 `LOAN_OVERDUE_CANNOT_EXTEND` |
| `newDueAt` หลังกำหนดคืนเดิม | 400 `INVALID_DUE_AT` |
| รวมไม่เกิน `maxLoanHours` นับจากเวลายืม | 422 `LOAN_DURATION_EXCEEDED` (`details.maxDueAt`) |
| ไม่มีคนจองต่อในช่วงที่ขอต่อ | 409 `EXTEND_CONFLICT_RESERVATION` (`details.maxDueAt`) |

**200** → `Loan` (dueAt ใหม่)

#### L4 `POST /loans/:id/return-request` — กดคืน

ไม่มี body · **200** → `Loan` (`loanStatus: "return_pending"`, `isLate` ตามเวลากด)
**Error:** 404 `LOAN_NOT_FOUND`, 409 `RETURN_ALREADY_REQUESTED`, 409 `LOAN_NOT_ACTIVE`

#### L5 `GET /loans` — แอดมินดูการยืมทั้งหมด

Query: `userId`, `notebookId`, `status`, `isLate`, `from`, `to` (กรองตาม borrowedAt), `page`, `pageSize`, `sort` (`borrowedAt, dueAt`)
**200** → `Loan[]` + meta

#### L6 `GET /loans/pending-return` — รายการรอยืนยันรับคืน

Query: `page`, `pageSize` · **200** → `Loan[]` + meta (กดคืนก่อนอยู่บนสุด)

#### L7 `POST /loans/:id/confirm-return` — ยืนยันรับเครื่อง

```json
{ "returnCondition": "damaged", "returnNote": "จอแตกมุมขวา", "returnRequestedAt": null }
```

| Field | กฎ |
| --- | --- |
| returnCondition | บังคับ `normal` หรือ `damaged` |
| returnNote | บังคับเมื่อ `damaged` 1–500 ตัว |
| returnRequestedAt | ไม่บังคับ ใช้เมื่อสมาชิกลืมกดคืน ระบุเวลาที่เครื่องมาถึงจริง (ระหว่างเวลายืมถึงตอนนี้) ไม่ส่ง = เวลาปัจจุบัน |

**200**

```json
{
  "success": true,
  "data": {
    "loan": { "id": 120, "loanStatus": "returned", "isLate": false, "returnCondition": "damaged", "...": "..." },
    "warnings": { "affectedReservations": [] }
  }
}
```

เมื่อ `damaged` เครื่องเปลี่ยนสภาพเป็นเสียหายอัตโนมัติ และ `affectedReservations` คือการจองในอนาคตของเครื่องนี้
**Error:** 404 `LOAN_NOT_FOUND`, 409 `LOAN_ALREADY_RETURNED`, 409 `LOAN_CANCELLED`

#### L8 `POST /loans/:id/cancel` — แอดมินยกเลิก

```json
{ "reason": "บันทึกผิดเครื่อง" }
```

**200** → `Loan` · ผู้ยืมได้แจ้งเตือน `loan_cancelled`
**Error:** 404 `LOAN_NOT_FOUND`, 409 `LOAN_CANNOT_CANCEL`

### 4.8 การจอง

#### R1 `POST /reservations` — จองล่วงหน้า

```json
{ "notebookId": 7, "startAt": "2026-10-10T09:00:00+07:00", "endAt": "2026-10-10T16:00:00+07:00" }
```

| กฎ | Error |
| --- | --- |
| `startAt` อยู่ในอนาคต, `endAt > startAt`, ยาวไม่เกิน `maxLoanHours` | 400 `INVALID_TIME_RANGE` |
| `startAt` ไม่เกิน `reservationMaxDaysAhead` วันนับจากตอนนี้ | 400 `RESERVATION_TOO_FAR_AHEAD` |
| เครื่องมีอยู่และสภาพปกติ | 404 `NOTEBOOK_NOT_FOUND`, 409 `NOTEBOOK_NOT_AVAILABLE` |
| ไม่ทับการจองอื่น | 409 `RESERVATION_CONFLICT` |
| ไม่ทับการยืมที่ยังไม่คืน | 409 `LOAN_CONFLICT` |

**201** → `Reservation`

#### R2 `GET /reservations/:id`

**200** → `Reservation` · **Error:** 404 `RESERVATION_NOT_FOUND`

#### R3 `POST /reservations/:id/pickup` — รับเครื่องตามที่จอง

ไม่มี body · ทำได้เมื่อ `status = active` (ตั้งแต่ `startAt` ถึง `pickupDeadline`)
**201** → `Loan` (`reservationId` = การจองนี้, `dueAt` = `endAt` ของการจอง)

| Error | เมื่อ |
| --- | --- |
| 404 `RESERVATION_NOT_FOUND` | ไม่พบ หรือเป็นของคนอื่น |
| 409 `RESERVATION_NOT_STARTED` | ยังไม่ถึงเวลาเริ่ม |
| 409 `RESERVATION_EXPIRED` | เลยเวลาผ่อนผันแล้ว |
| 409 `RESERVATION_CANCELLED` | ถูกยกเลิก |
| 409 `RESERVATION_ALREADY_PICKED_UP` | รับเครื่องไปแล้ว |
| 409 `NOTEBOOK_NOT_RETURNED_YET` | ผู้ยืมคนก่อนยังไม่คืน/แอดมินยังไม่ยืนยัน |
| 409 `NOTEBOOK_NOT_AVAILABLE` | เครื่องเสียหายหรือซ่อมบำรุง |
| 422 `LOAN_LIMIT_REACHED` | ยืมค้างครบโควตา |

#### R4 `POST /reservations/:id/cancel`

```json
{ "reason": "เครื่องส่งซ่อม" }
```

สมาชิกยกเลิกของตัวเอง `reason` ไม่บังคับ · แอดมินยกเลิกของคนอื่น `reason` บังคับ และเจ้าของได้แจ้งเตือน `reservation_cancelled`
**200** → `Reservation` · **Error:** 404 `RESERVATION_NOT_FOUND`, 409 `RESERVATION_CANNOT_CANCEL` (รับเครื่องแล้ว/ยกเลิกแล้ว/หมดอายุ)

#### R5 `GET /reservations` — แอดมินดูการจองทั้งหมด

Query: `userId`, `notebookId`, `status`, `from`, `to` (กรองตาม startAt), `page`, `pageSize`, `sort` (`startAt, createdAt`)
**200** → `Reservation[]` + meta

### 4.9 สมาชิก (แอดมิน)

| Endpoint | Request | Response | Error |
| --- | --- | --- | --- |
| U1 `GET /users` | `keyword, roleId, isActive, page, pageSize, sort (createdAt, firstName, email, lastLoginAt), includeDeleted` | `User[]` + meta | – |
| U2 `GET /users/:id` | – | `User` + `activeLoanCount` | 404 `USER_NOT_FOUND` |
| U3 `PATCH /users/:id` | `{ roleId?, memberCode?, email?, firstName?, lastName?, phone? }` | `User` | 409 `EMAIL_TAKEN`, 409 `MEMBER_CODE_TAKEN`, 409 `LAST_ADMIN` |
| U4 `POST /users/:id/suspend` | – | `User` (`isActive: false`) | 409 `CANNOT_MODIFY_SELF`, 409 `LAST_ADMIN` |
| U5 `POST /users/:id/activate` | – | `User` | 404 `USER_NOT_FOUND` |
| U6 `DELETE /users/:id` | – | `data: null` | 409 `CANNOT_MODIFY_SELF`, 409 `LAST_ADMIN`, 409 `USER_HAS_ACTIVE_LOANS` |
| U7 `POST /users/:id/restore` | – | `User` | 404 `USER_NOT_FOUND` |

### 4.10 รายงาน

| Endpoint | Query | Response |
| --- | --- | --- |
| P1 `GET /reports/summary` | – | `{ total, available, borrowed, reserved, damaged, maintenance, retired }` |
| P2 `GET /reports/notebooks` | เหมือน N1 | `Notebook[]` + meta (โน๊ตบุ๊คทั้งหมดพร้อมสถานะ) |
| P3 `GET /reports/outstanding-loans` | `status` (`borrowing|overdue|return_pending`), `page`, `pageSize` | `Loan[]` + meta (เกินกำหนดก่อน) |
| P4 `GET /reports/available-notebooks` | `brandId`, `modelId`, `page`, `pageSize` | `Notebook[]` + meta |
| P5 `GET /reports/monthly-loans` | `fromMonth`, `toMonth` (บังคับ, ห่างไม่เกิน 24 เดือน) | ตัวอย่างด้านล่าง |

```json
{
  "success": true,
  "data": [
    { "loanMonth": "2026-08", "totalLoans": 42, "lateLoans": 5 },
    { "loanMonth": "2026-09", "totalLoans": 0,  "lateLoans": 0 },
    { "loanMonth": "2026-10", "totalLoans": 17, "lateLoans": 1 }
  ]
}
```

ทุกเดือนในช่วงมีข้อมูล (เดือนที่ไม่มีการยืมเป็น 0) ไม่นับรายการที่ยกเลิก

### 4.11 Audit Log

| Endpoint | Query | Response |
| --- | --- | --- |
| G1 `GET /audit-logs` | `userId, action, targetTable, targetId, from, to, page, pageSize` | `AuditLog[]` + meta (ใหม่สุดก่อน) |
| G2 `GET /audit-logs/:id` | – | `AuditLog` |

```json
{
  "id": 9001, "userId": 15, "userFullName": "สมชาย ใจดี", "action": "UPDATE",
  "targetTable": "loans", "targetId": 120,
  "oldValues": { "dueAt": "2026-10-08T17:00:00+07:00" },
  "newValues": { "event": "extend", "dueAt": "2026-10-08T21:00:00+07:00" },
  "ipAddress": "192.168.1.20", "userAgent": "Mozilla/5.0 ...", "createdAt": "2026-10-08T15:02:11+07:00"
}
```

---

## 5. Error Code ทั้งหมด

| Code | HTTP | ข้อความ (ภาษาไทย) |
| --- | --- | --- |
| VALIDATION_ERROR | 400 | ข้อมูลไม่ถูกต้อง (ดูรายละเอียดใน `details`) |
| INVALID_FILE | 400 | ไฟล์ต้องเป็นรูป jpg, png หรือ webp ขนาดไม่เกิน 2 MB |
| INVALID_DUE_AT | 400 | เวลาคืนไม่ถูกต้อง |
| INVALID_TIME_RANGE | 400 | ช่วงเวลาไม่ถูกต้อง |
| RESERVATION_TOO_FAR_AHEAD | 400 | จองล่วงหน้าได้ไม่เกิน {n} วัน |
| CURRENT_PASSWORD_INCORRECT | 400 | รหัสผ่านปัจจุบันไม่ถูกต้อง |
| UNKNOWN_SETTING | 400 | ไม่มีค่าตั้งค่านี้ในระบบ |
| UNAUTHORIZED | 401 | กรุณาเข้าสู่ระบบใหม่ |
| INVALID_CREDENTIALS | 401 | อีเมลหรือรหัสผ่านไม่ถูกต้อง |
| ACCOUNT_SUSPENDED | 403 | บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ |
| FORBIDDEN | 403 | คุณไม่มีสิทธิ์ทำรายการนี้ |
| USER_NOT_FOUND | 404 | ไม่พบผู้ใช้ |
| BRAND_NOT_FOUND | 404 | ไม่พบยี่ห้อ |
| MODEL_NOT_FOUND | 404 | ไม่พบรุ่น |
| NOTEBOOK_NOT_FOUND | 404 | ไม่พบโน๊ตบุ๊ค |
| LOAN_NOT_FOUND | 404 | ไม่พบรายการยืม |
| RESERVATION_NOT_FOUND | 404 | ไม่พบการจอง |
| NOTIFICATION_NOT_FOUND | 404 | ไม่พบการแจ้งเตือน |
| EMAIL_TAKEN | 409 | อีเมลนี้ถูกใช้แล้ว |
| MEMBER_CODE_TAKEN | 409 | รหัสสมาชิกนี้ถูกใช้แล้ว |
| BRAND_NAME_TAKEN | 409 | มียี่ห้อนี้อยู่แล้ว |
| MODEL_NAME_TAKEN | 409 | มีรุ่นนี้ในยี่ห้อนี้อยู่แล้ว |
| ASSET_CODE_TAKEN | 409 | รหัสครุภัณฑ์นี้ถูกใช้แล้ว |
| SERIAL_NUMBER_TAKEN | 409 | Serial number นี้ถูกใช้แล้ว |
| BRAND_IN_USE | 409 | ลบไม่ได้ ยังมีรุ่นที่ใช้ยี่ห้อนี้ |
| MODEL_IN_USE | 409 | ลบไม่ได้ ยังมีเครื่องที่ใช้รุ่นนี้ |
| NOTEBOOK_HAS_COMMITMENTS | 409 | ทำรายการไม่ได้ เครื่องนี้มีการยืมหรือการจองค้างอยู่ |
| NOTEBOOK_NOT_AVAILABLE | 409 | เครื่องนี้ไม่พร้อมให้ยืม |
| NOTEBOOK_ALREADY_BORROWED | 409 | เครื่องนี้ถูกยืมอยู่ |
| NOTEBOOK_NOT_RETURNED_YET | 409 | ผู้ยืมคนก่อนยังไม่ได้คืนเครื่อง กรุณาติดต่อผู้ดูแลระบบ |
| RESERVATION_CONFLICT | 409 | ช่วงเวลานี้มีผู้จองไว้แล้ว |
| OWN_RESERVATION_OVERLAP | 409 | คุณมีการจองเครื่องนี้ในช่วงเวลานี้ กรุณารับเครื่องจากการจองหรือยกเลิกการจองก่อน |
| LOAN_CONFLICT | 409 | ช่วงเวลานี้เครื่องถูกยืมอยู่ |
| EXTEND_CONFLICT_RESERVATION | 409 | ต่อเวลาไม่ได้ มีผู้จองเครื่องต่อจากคุณ |
| LOAN_NOT_ACTIVE | 409 | รายการยืมนี้ไม่อยู่ในสถานะที่ทำรายการได้ |
| LOAN_OVERDUE_CANNOT_EXTEND | 409 | เกินกำหนดคืนแล้ว ไม่สามารถต่อเวลาได้ |
| RETURN_ALREADY_REQUESTED | 409 | คุณกดคืนเครื่องนี้แล้ว รอผู้ดูแลยืนยัน |
| LOAN_ALREADY_RETURNED | 409 | รายการนี้รับคืนเรียบร้อยแล้ว |
| LOAN_CANCELLED | 409 | รายการนี้ถูกยกเลิกแล้ว |
| LOAN_CANNOT_CANCEL | 409 | ยกเลิกไม่ได้ รายการนี้รับคืนแล้วหรือถูกยกเลิกไปแล้ว |
| LOAN_STATE_CHANGED | 409 | สถานะรายการเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่ |
| RESERVATION_NOT_STARTED | 409 | ยังไม่ถึงเวลารับเครื่อง |
| RESERVATION_EXPIRED | 409 | การจองหมดอายุแล้ว |
| RESERVATION_CANCELLED | 409 | การจองนี้ถูกยกเลิกแล้ว |
| RESERVATION_ALREADY_PICKED_UP | 409 | รับเครื่องตามการจองนี้แล้ว |
| RESERVATION_CANNOT_CANCEL | 409 | ยกเลิกการจองนี้ไม่ได้ |
| CANNOT_MODIFY_SELF | 409 | ไม่สามารถทำรายการนี้กับบัญชีของตัวเองได้ |
| LAST_ADMIN | 409 | ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน |
| USER_HAS_ACTIVE_LOANS | 409 | ลบไม่ได้ ผู้ใช้นี้ยังมีเครื่องที่ยังไม่คืน |
| REFERENCE_NOT_FOUND | 409 | ข้อมูลที่อ้างถึงไม่มีอยู่ในระบบ |
| RESOURCE_IN_USE | 409 | ข้อมูลนี้ถูกใช้งานอยู่ |
| LOAN_LIMIT_REACHED | 422 | คุณยืมครบจำนวนสูงสุดแล้ว กรุณาคืนเครื่องก่อน |
| LOAN_DURATION_EXCEEDED | 422 | เวลายืมรวมเกิน {n} ชั่วโมง |
| INTERNAL_ERROR | 500 | ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง |

---

## 6. ตัวอย่างลำดับการเรียกจาก Frontend

**สมาชิกยืมทันที**

1. `GET /settings/public` → ได้ `maxLoanHours` ไว้จำกัดตัวเลือกเวลาคืน
2. `GET /notebooks?currentStatus=available` หรือสแกน → `GET /notebooks/by-asset/NB-2025-0007`
3. `POST /loans` → ได้ `Loan` แสดงกำหนดคืน
4. (ต่อเวลา) `GET /loans/120` อ่าน `actions.maxExtendDueAt` → `POST /loans/120/extend`
5. `POST /loans/120/return-request` → แสดง "รอผู้ดูแลยืนยันรับคืน"

**สมาชิกจองแล้วมารับ**

1. `GET /notebooks/available?startAt=...&endAt=...` → `POST /reservations`
2. ถึงเวลา `GET /me/reservations?status=active` → `POST /reservations/44/pickup`

**แอดมินรับคืน**

1. `GET /loans/pending-return` หรือสแกน `GET /notebooks/by-asset/...` (ได้ `activeLoan`)
2. `POST /loans/120/confirm-return` → ถ้า `warnings.affectedReservations` ไม่ว่าง ถามว่าจะยกเลิกไหม → `POST /reservations/:id/cancel`

---

## 7. สิ่งที่ต้อง Approve

- [ ] Base URL และ version `/api/v1` · port 3000
- [ ] รูปแบบ response `{ success, data, meta }` / `{ success, error }`
- [ ] รายการ endpoint และสิทธิ์ (ข้อ 2)
- [ ] รายการ error code และ HTTP status (ข้อ 5)
- [ ] ข้อจำกัดไฟล์รูป jpg/png/webp ≤ 2 MB
- [ ] ยังไม่มี endpoint: export รายงาน, ลืมรหัสผ่าน/แอดมินรีเซ็ตรหัสผ่าน, จัดการ role/permission (รอคำตอบจาก requirement ข้อ 12)
