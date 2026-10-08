# Frontend – ระบบยืมคืนโน๊ตบุ๊ค

Vanilla JavaScript (ES Modules) + HTML + CSS ไม่ใช้ framework · 1 หน้าจอ = 1 ไฟล์ HTML (MPA) ไม่มี hash router

## รัน

**ดูหน้าเว็บด้วยข้อมูลจำลอง (ไม่ต้องมี backend)**

```bash
npm install          # ติดตั้งเครื่องมือทดสอบ (devDependencies เท่านั้น)
npm run serve        # เปิด http://localhost:5173/login.html?mockReset=1
```

หรือคัดลอกโฟลเดอร์นี้ไปวางใน `htdocs` ของ XAMPP โฟลเดอร์ใดก็ได้ แล้วเปิด `login.html` (ทุก path เป็น relative)

| บัญชี | รหัสผ่าน | ใช้ดู |
| --- | --- | --- |
| `member@example.com` | `Passw0rd` | สมาชิกที่ไม่มีเครื่องยืม มีการจองที่ถึงเวลารับเครื่องแล้ว |
| `member2@example.com` | `Passw0rd` | สมาชิกที่กำลังยืมเครื่อง (บัตรยืมนับถอยหลัง) |
| `member4@example.com` | `Passw0rd` | สมาชิกที่ยืมเกินกำหนด |
| `admin@example.com` | `Passw0rd` | แอดมิน (เห็นหน้าแอดมินทั้งหมด) |
| `suspended@example.com` | `Passw0rd` | บัญชีที่ถูกระงับ (login ไม่ได้) |

พารามิเตอร์ใน URL (ใช้ได้ทุกหน้าเมื่อ `USE_MOCK = true`)

- `?mockReset=1` ล้างข้อมูลจำลองกลับเป็นค่าตั้งต้น
- `?mockNow=2026-10-08T16:30:00+07:00` ตั้งเวลาปัจจุบันของ mock (เวลาเดินต่อ)

## ต่อ backend จริง

แก้ `assets/js/config.js`: ตั้ง `USE_MOCK = false` และ `API_BASE_URL`
**Backend ต้องเปิด CORS** ให้ origin ของ frontend (เช่น `http://localhost` พอร์ต 80 ของ XAMPP) เพราะ Express อยู่ที่พอร์ต 3000

## ทดสอบ

```bash
npm test             # unit + component (Vitest + jsdom)
npm run test:e2e     # E2E (Playwright + mock) บนจอ 1280px และ 375px
```

ครั้งแรกต้องติดตั้ง browser: `npx playwright install chromium`
ผลทดสอบไม่ขึ้นกับเวลาที่รัน เพราะใช้ fake timer ของ Vitest และ `page.clock` ของ Playwright

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
| `notifyBeforeDueMinutes` ไม่อยู่ใน S1 | ใช้ `DUE_SOON_MINUTES` ใน `config.js` |
| CORS ระหว่าง XAMPP (80) กับ Express (3000) | งาน backend ต้องเปิด CORS |
| กฎ field ของเครื่อง (N5) ไม่ระบุ | ตรวจแค่ความยาว ≤ 100 และค่าบังคับ (`validateNotebook`) |
| รายการ `type` ของแจ้งเตือนมีไม่ครบ (มีแค่ `loan_due_soon`, `loan_cancelled`, `reservation_cancelled`) | ใช้ 3 type นี้ในข้อมูลจำลอง |
| M3/D5 mock ไม่เก็บไฟล์รูปจริง | mock สร้างรูปจำลองแทน |
| ช่วงเวลาที่มีคนจองไว้ 7 วันข้างหน้า (ตาม UI plan) — สมาชิกไม่เห็นการจองของคนอื่น (N4 ให้ `upcomingReservations` เฉพาะแอดมิน) | หน้ารายละเอียดเครื่องแสดงไม่ได้ ใช้แท็บ "หาเครื่องว่างตามช่วงเวลา" (N2) แทน |
| D1 ไม่มี `includeDeleted` | ไม่มีทางแสดงรุ่นที่ลบแล้ว จึงไม่มีปุ่มกู้คืนรุ่น (D7 มี endpoint แต่ไม่มี UI) |
| U1 ไม่ส่ง `activeLoanCount` (มีแค่ U2) | แสดงในหน้าต่างรายละเอียดของสมาชิก |
| G2 ไม่มี error code สำหรับ "ไม่พบ" | mock ตอบ 404 ด้วย `INTERNAL_ERROR` |
| ค่าที่ตั้งได้ของ `action` ใน audit log ไม่ระบุ | ช่อง filter เป็นข้อความอิสระ |
