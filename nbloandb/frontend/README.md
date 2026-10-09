# Frontend – ระบบยืมคืนโน๊ตบุ๊ค

Vanilla JavaScript (ES Modules) + HTML + CSS ไม่ใช้ framework · 1 หน้าจอ = 1 ไฟล์ HTML (MPA) ไม่มี hash router

## รัน

ค่าเริ่มต้นคือ **ต่อ backend จริง** (`../backend`) ส่วนข้อมูลจำลอง (mock) เปิดเองได้ด้วย `?mock=1`

### ต่อ backend จริง

1. เตรียม backend (ทำครั้งเดียว ตาม `../backend/README.md`): เปิด MariaDB ของ XAMPP, import `../notebook_loan.sql`, สร้าง `.env` จาก `.env.example`, `npm install`
2. รัน backend: `cd ../backend && npm start` (http://localhost:3000/api/v1)
3. รัน frontend: `npm install` แล้ว `npm run serve` เปิด http://localhost:5173/login.html

`npm run serve` ส่งต่อ `/api` และ `/uploads` ไปที่ backend ให้เอง (ตั้ง `BACKEND_URL` ถ้า backend ไม่ได้อยู่ที่พอร์ต 3000) จึงไม่ต้องใช้ CORS
ถ้าวางโฟลเดอร์นี้ใน `htdocs` ของ XAMPP แทน frontend จะเรียก `http://localhost:3000/api/v1` ตรงๆ ซึ่ง **backend ต้องเปิด CORS** (ตอนนี้ backend ยังไม่มี)

บัญชีตัวอย่างจากฐานข้อมูลจริง

| บัญชี | รหัสผ่าน |
| --- | --- |
| `admin@example.com` | `Admin@1234` |
| `member@example.com` | `Member@1234` |

### ใช้ข้อมูลจำลอง (ไม่ต้องมี backend)

เปิด http://localhost:5173/login.html?mock=1&mockReset=1 (จำโหมดไว้ในเบราว์เซอร์ ปิดด้วย `?mock=0`) จะมีแถบ "โหมดทดสอบ (ข้อมูลจำลอง)" ด้านบน

| บัญชี (รหัสผ่าน `Passw0rd`) | ใช้ดู |
| --- | --- |
| `member@example.com` | สมาชิกที่ไม่มีเครื่องยืม มีการจองที่ถึงเวลารับเครื่องแล้ว |
| `member2@example.com` | สมาชิกที่กำลังยืมเครื่อง (บัตรยืมนับถอยหลัง) |
| `member4@example.com` | สมาชิกที่ยืมเกินกำหนด |
| `admin@example.com` | แอดมิน |
| `suspended@example.com` | บัญชีที่ถูกระงับ |

พารามิเตอร์ของ mock: `?mockReset=1` ล้างข้อมูลกลับเป็นค่าตั้งต้น · `?mockNow=2026-10-08T16:30:00+07:00` ตั้งเวลาปัจจุบัน

## ทดสอบ

```bash
npm test             # unit + component (Vitest + jsdom)
npm run test:e2e     # E2E (Playwright + mock) บนจอ 1280px และ 375px
```

ครั้งแรกต้องติดตั้ง browser: `npx playwright install chromium`
test ทุกชั้นทำงานกับ mock API (ตั้งค่าไว้ใน `tests/setup.js` และ `playwright.config.js`) ผลทดสอบไม่ขึ้นกับเวลาที่รัน เพราะใช้ fake timer ของ Vitest และ `page.clock` ของ Playwright

## โครงสร้าง

```
*.html, member/, admin/   หน้าจอ (แต่ละหน้าโหลด assets/js/pages/<ชื่อหน้า>.js)
assets/css/               tokens.css, base.css, components.css
assets/js/config.js       API_BASE_URL, USE_MOCK, ค่าคงที่
assets/js/core/           api, auth, guard, layout, dom, page, clock
assets/js/utils/          validate, datetime, status, errors, query
assets/js/components/     modal, toast, dataTable, loanTicket ฯลฯ
assets/js/mock/           mockApi, mockAdmin, mockData, mockClock
tests/                    unit, component, e2e
```

ทุกหน้าเริ่มด้วย `startPage()` (`core/page.js`): guard ตรวจ login/role/permission → วาด header และเมนู → โหลดข้อมูล (มี skeleton, empty state, error state) → ผูก event

## สิ่งที่ spec ยังไม่รองรับ

| เรื่อง | สิ่งที่ทำ |
| --- | --- |
| เปลี่ยน role ผู้ใช้ (U3 รับ `roleId` แต่ไม่มี endpoint รายการ role) | ไม่ทำ UI มี `TODO` ใน `admin-users.js` |
| Export รายงาน PDF/Excel | ไม่ทำ |
| ลืมรหัสผ่าน / แอดมินรีเซ็ตรหัสผ่าน | ไม่ทำ ไม่มีลิงก์ในหน้า login |
| เวลาทำการ | ไม่จำกัด เลือกเวลาได้ตลอด 24 ชม. |
| `reminderBeforeMinutes` ไม่อยู่ใน S1 | ใช้ `DUE_SOON_MINUTES` ใน `config.js` |
| CORS ระหว่าง XAMPP (80) กับ Express (3000) | backend ยังไม่มี CORS ตอนพัฒนาใช้ proxy ของ `npm run serve` แทน |
| รหัส permission ใน spec ไม่ตรงกับ seed จริง (เช่น `loan.confirm_return` กับ `loan.receive`) | frontend ใช้รหัสตาม `notebook_loan.sql` |
| ชื่อ setting `notifyBeforeDueMinutes` ใน spec แต่ backend ใช้ `reminderBeforeMinutes` | frontend ใช้ `reminderBeforeMinutes` |
| กฎ field ของเครื่อง (N5) ไม่ระบุ | ตรวจแค่ความยาว ≤ 100 และค่าบังคับ (`validateNotebook`) |
| รายการ `type` ของแจ้งเตือนมีไม่ครบ (มีแค่ `loan_due_soon`, `loan_cancelled`, `reservation_cancelled`) | ใช้ 3 type นี้ในข้อมูลจำลอง |
| M3/D5 mock ไม่เก็บไฟล์รูปจริง | mock สร้างรูปจำลองแทน |
| ช่วงเวลาที่มีคนจองไว้ 7 วันข้างหน้า (ตาม UI plan) — สมาชิกไม่เห็นการจองของคนอื่น (N4 ให้ `upcomingReservations` เฉพาะแอดมิน) | หน้ารายละเอียดเครื่องแสดงไม่ได้ ใช้แท็บ "หาเครื่องว่างตามช่วงเวลา" (N2) แทน |
| D1 ไม่มี `includeDeleted` | ไม่มีทางแสดงรุ่นที่ลบแล้ว จึงไม่มีปุ่มกู้คืนรุ่น (D7 มี endpoint แต่ไม่มี UI) |
| U1 ไม่ส่ง `activeLoanCount` (มีแค่ U2) | แสดงในหน้าต่างรายละเอียดของสมาชิก |
| G2 ไม่มี error code สำหรับ "ไม่พบ" | mock ตอบ 404 ด้วย `INTERNAL_ERROR` |
| ค่าที่ตั้งได้ของ `action` ใน audit log ไม่ระบุ | ช่อง filter เป็นข้อความอิสระ |
