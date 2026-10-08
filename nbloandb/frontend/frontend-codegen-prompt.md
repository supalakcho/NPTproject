# Prompt: Generate Frontend – ระบบยืมคืนโน๊ตบุ๊ค

> **วิธีใช้:** คัดลอกทั้งหมดตั้งแต่หัวข้อ "Role" ลงไปเป็น prompt แล้วแนบไฟล์ต่อไปนี้ไปด้วย
>
> 1. `http-api-spec.md` – สัญญา API (ใช้เป็นแหล่งความจริงหลัก)
> 2. `requirement-summary.md` – requirement ล่าสุด
> 3. `business-logic-plan.md` – กฎธุรกิจและ permission
> 4. `frontend-ui-plan.md` – แผนดีไซน์ UI เดิม
>
> ถ้าข้อมูลในไฟล์แนบขัดกับ prompt นี้ ให้ยึดตาม `http-api-spec.md` สำหรับเรื่อง API และยึดตาม prompt นี้สำหรับเรื่องโครงสร้าง frontend

---

## Role

คุณคือ Frontend Developer ที่เขียน Vanilla JavaScript (ES Modules), HTML และ CSS โดยไม่ใช้ framework เขียนโค้ดอ่านง่าย มี comment ภาษาไทยอธิบายส่วนที่สำคัญ

## Context

- ระบบยืมคืนโน๊ตบุ๊ค มีผู้ใช้ 2 role คือ สมาชิก (`member`) และแอดมิน (`admin`)
- เป้าหมายหลักของระบบคือแก้ปัญหาการยืมเกินเวลา ผู้ใช้ส่วนใหญ่ไม่เก่งเทคโนโลยี ต้องใช้งานบนมือถือได้ และโหลดเร็ว
- Database และ Business Logic ออกแบบเสร็จแล้ว HTTP API ออกแบบเสร็จแล้ว (ไฟล์ `http-api-spec.md`) แต่ **route และ controller ฝั่ง backend ยังไม่ได้เขียน** frontend จึงต้องทำงานกับ mock API ได้ก่อน
- Backend: Node.js/Express ที่ `http://localhost:3000/api/v1` · Hosting: XAMPP/Localhost · ภาษา UI: ไทย

## Objective

เขียนโค้ด frontend ทั้งหมดตามแผนใน `frontend-ui-plan.md` โดยเปลี่ยนจาก SPA เป็น **Multi-Page Application (MPA)** คือ 1 หน้าจอ = 1 ไฟล์ HTML และทุก request ต้องตรงกับ `http-api-spec.md`

## Constraint

1. ทำเฉพาะ frontend ห้ามเขียน backend, route, controller หรือ SQL
2. **ไม่ใช้ SPA และไม่ใช้ hash router** แต่ละหน้าเป็นไฟล์ HTML แยก เปลี่ยนหน้าด้วยลิงก์ปกติ
3. ไม่ใช้ framework หรือ library ฝั่ง runtime (ไม่มี React, Vue, jQuery, chart library, date library) ยกเว้น Google Fonts
4. Library สำหรับทดสอบ (Vitest, jsdom, Playwright) ใช้ได้เป็น devDependency เท่านั้น ห้ามถูกโหลดในหน้าเว็บจริง
5. ใช้ path แบบ relative ทั้งหมด เพื่อให้วางใน `htdocs` โฟลเดอร์ใดก็ได้ของ XAMPP
6. ห้ามสร้าง endpoint, field หรือ error code ที่ไม่มีใน `http-api-spec.md` ถ้าต้องใช้ข้อมูลที่ spec ไม่มี ให้ระบุไว้ในหัวข้อ "สิ่งที่ spec ยังไม่รองรับ" ตอนส่งงาน แทนการเดาเอง
7. Validation ฝั่ง frontend มีไว้ช่วยผู้ใช้เท่านั้น กฎที่ขึ้นกับเวลาปัจจุบันและการตรวจเวลาทับกัน backend เป็นผู้ตัดสิน ต้องแสดง `error.message` จาก backend ให้ผู้ใช้เห็นเสมอ
8. ห้ามใช้สีอย่างเดียวสื่อสถานะ ป้ายสถานะทุกตัวต้องมีข้อความกำกับ

---

## 1. โครงสร้างไฟล์

```
frontend/
  index.html                  // ตรวจ token แล้วพาไปหน้าแรกตาม role หรือหน้า login
  login.html
  register.html
  profile.html                // ใช้ร่วมกันทั้ง 2 role
  notifications.html          // ใช้ร่วมกันทั้ง 2 role
  member/
    home.html                 // บัตรยืม + การจองที่กำลังจะถึง
    notebooks.html            // ค้นหาเครื่อง (N1) + แท็บหาเครื่องว่างตามช่วงเวลา (N2)
    notebook.html             // ?id=7 รายละเอียด + ยืมทันที + จอง
    history.html              // แท็บการยืม / การจอง
  admin/
    returns.html              // หน้าแรกแอดมิน: รอยืนยันรับคืน
    notebooks.html
    models.html
    brands.html
    loans.html
    reservations.html
    users.html
    reports.html
    settings.html
    audit-logs.html
  assets/
    css/
      tokens.css
      base.css
      components.css
    js/
      config.js               // API_BASE_URL, USE_MOCK, POLL_INTERVAL_MS
      core/
        api.js                // fetch wrapper + แนบ JWT + แปลง response/error
        auth.js               // เก็บ/อ่าน/ลบ session, ตรวจ expiresAt
        guard.js              // requireLogin(), requireRole(), requirePermission()
        layout.js             // วาด header, เมนูตาม role/permission, กระดิ่งแจ้งเตือน
        dom.js                // helper สร้าง element แบบปลอดภัย (ไม่ใช้ innerHTML กับข้อมูลผู้ใช้)
      utils/
        validate.js           // pure function สำหรับทุกฟอร์ม
        datetime.js           // แปลง/แสดงเวลาไทย UTC+7
        status.js             // map สถานะ -> ข้อความไทย + token สี
        errors.js             // map error.code -> การกระทำใน UI
        query.js              // อ่าน/เขียน query string (page, filter)
      components/
        statusBadge.js
        modal.js
        confirmDialog.js
        toast.js
        dataTable.js
        pagination.js
        dateTimeRange.js
        countdown.js
        loanTicket.js
        barcodeInput.js
        fieldError.js
      mock/
        mockApi.js            // รับ request แบบเดียวกับ api.js แล้วตอบตาม spec
        mockData.js           // ข้อมูลตั้งต้น
        mockClock.js          // เวลาปัจจุบันของ mock เลื่อนได้
      pages/
        login.js, register.js, profile.js, notifications.js, index.js
        member-home.js, member-notebooks.js, member-notebook.js, member-history.js
        admin-returns.js, admin-notebooks.js, admin-models.js, admin-brands.js,
        admin-loans.js, admin-reservations.js, admin-users.js, admin-reports.js,
        admin-settings.js, admin-audit-logs.js
  tests/
    unit/
    component/
    e2e/
  package.json                // devDependencies + scripts เท่านั้น
  playwright.config.js
  vitest.config.js
  README.md                   // วิธีรัน (สั้นที่สุด)
```

### รูปแบบของทุกหน้า HTML

```html
<!-- ตัวอย่าง member/home.html -->
<body data-page="member-home">
  <div id="app-header"></div>
  <main id="main" tabindex="-1"></main>
  <div id="toast-region" aria-live="polite"></div>
  <script type="module" src="../assets/js/pages/member-home.js"></script>
</body>
```

ทุกไฟล์ใน `pages/` เริ่มด้วยลำดับเดียวกัน:

1. `await guard.requireRole('member')` (หรือ permission ที่หน้านั้นต้องใช้) ถ้าไม่ผ่านให้ redirect
2. `layout.render({ active: 'home' })`
3. โหลดข้อมูลและวาดหน้าจอ แสดง skeleton/loading ระหว่างรอ
4. ผูก event

---

## 2. Session และสิทธิ์ (MPA)

- เก็บ `{ token, expiresAt, user, permissions }` ใน `localStorage` key `nl.session` เพราะ MPA โหลดหน้าใหม่ทุกครั้ง
- `auth.isExpired()` เทียบ `expiresAt` กับเวลาปัจจุบัน ถ้าหมดอายุให้ลบ session แล้วไป `login.html?next=<path ปัจจุบัน>`
- `index.html` และการเปิดแอปครั้งแรกของแต่ละ tab: เรียก `GET /me` (M1) เพื่อยืนยันว่า token ยังใช้ได้และอัปเดต `user`/`permissions`
- ได้ `401` จาก API ใดก็ตาม → ลบ session → ไปหน้า login พร้อม `next`
- ได้ `403 ACCOUNT_SUSPENDED` → ลบ session → หน้า login แสดงข้อความจาก backend
- หลัง login/register: ถ้ามี `next` และเป็น path ภายในระบบ (ขึ้นต้นด้วยโฟลเดอร์ของแอป ไม่ใช่ URL ภายนอก) ให้ไปที่นั่น ไม่งั้นไปหน้าแรกตาม `roleCode`
  - `member` → `member/home.html`
  - `admin` → `admin/returns.html`
- สมาชิกเปิด URL หน้าแอดมินตรงๆ → redirect ไป `member/home.html` (และกลับกัน)
- เมนูแสดงตาม `permissions` (เช่น ซ่อนเมนูรายงานถ้าไม่มี `report.view`)
- ปุ่มออกจากระบบ: `POST /auth/logout` (A3) แล้วลบ session ไม่ว่า request จะสำเร็จหรือไม่

---

## 3. API Layer

`api.js` export ฟังก์ชันแยกตาม endpoint ใน spec ข้อ 2 โดยตั้งชื่อตามรหัส endpoint เป็น comment เช่น

```js
// L1 POST /loans
export function borrowNow({ notebookId, assetCode, dueAt }) { ... }
// L3 POST /loans/:id/extend
export function extendLoan(id, { newDueAt }) { ... }
```

ข้อกำหนด:

- ทุกฟังก์ชันคืน `{ data, meta }` เมื่อสำเร็จ และ throw `ApiError { status, code, message, details }` เมื่อไม่สำเร็จ
- network error หรือ response ที่ไม่ใช่ JSON → throw `ApiError` code `NETWORK_ERROR` ข้อความ "เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง"
- multipart (M3, D5) ส่ง field ชื่อ `image` ตรวจชนิด jpg/png/webp และขนาด ≤ 2 MB ก่อนส่ง
- ถ้า `config.USE_MOCK === true` ให้ทุกฟังก์ชันเรียก `mockApi` แทน `fetch` โดยหน้าจอไม่ต้องรู้

### Mock API

- ตอบด้วยรูปแบบ `{ success, data, meta }` / `{ success, error }` และ HTTP status ตาม spec ทุกประการ
- ทำกฎหลักของ spec ให้ครบพอทดสอบ UI ได้: L1, L3, L4, L7, R1, R3, R4 พร้อม error code ในตารางกฎของแต่ละ endpoint
- เก็บข้อมูลใน `localStorage` key `nl.mockDb` เพื่อให้ข้อมูลอยู่ข้ามหน้า (MPA) เปิด URL ใดก็ได้พร้อม `?mockReset=1` เพื่อล้างข้อมูลกลับเป็นค่าตั้งต้น
- `mockClock` ใช้แทนเวลาจริงใน mock และเลื่อนได้จาก test หรือ `?mockNow=2026-10-08T16:30:00+07:00`
- หน่วงเวลาตอบ 200–400 ms เพื่อให้เห็นสถานะ loading
- บัญชีตั้งต้น: `member@example.com` / `Passw0rd`, `member2@example.com` / `Passw0rd`, `admin@example.com` / `Passw0rd`, `suspended@example.com` / `Passw0rd` (ถูกระงับ)
- ข้อมูลตั้งต้นต้องมีเครื่องครบทุก `currentStatus`, การจองในอนาคตที่ทับกับเวลาที่ผู้ใช้น่าจะเลือก, รายการรอยืนยันรับคืนอย่างน้อย 3 รายการ (มี 1 รายการคืนช้า), และแจ้งเตือนทุก type
- แสดงแถบเล็กด้านบนทุกหน้าว่า "โหมดทดสอบ (ข้อมูลจำลอง)" เมื่อ `USE_MOCK` เป็น true

---

## 4. ดีไซน์

### Design tokens (`tokens.css`)

| Token | Hex | ใช้กับ |
| --- | --- | --- |
| `--ink` | #14213D | ตัวอักษรหลัก, header, ปุ่มหลัก |
| `--paper` | #F6F8FA | พื้นหลัง |
| `--surface` | #FFFFFF | พื้นของบัตร, ตาราง, modal |
| `--line` | #D0D7DE | เส้นแบ่ง, ขอบ input |
| `--ok` | #1A7F4B | ว่าง, สภาพปกติ |
| `--busy` | #1F5FBF | ถูกยืม, กำลังยืม |
| `--hold` | #A86B00 | ถูกจอง, ใกล้ครบกำหนด (≤ 60 นาที) |
| `--alert` | #B42318 | เกินกำหนด, เสียหาย, คืนช้า |
| `--muted` | #5B6573 | ซ่อมบำรุง, ปลดระวาง, ยกเลิก, รอยืนยัน |

- ฟอนต์เนื้อหา: **IBM Plex Sans Thai Looped** · หัวข้อและตัวเลขนับถอยหลัง: **IBM Plex Sans Thai** ตัวหนา · fallback `Tahoma, sans-serif`
- Mobile-first, เนื้อหาชิดซ้าย, ปุ่มสูง ≥ 44px, เห็นกรอบ focus ชัดเจน, รองรับ `prefers-reduced-motion`
- มือถือ: เมนูด้านล่างจอ (สมาชิก 4 เมนู: หน้าแรก, ค้นหา, ประวัติ, โปรไฟล์) · เดสก์ท็อป (≥ 960px): sidebar ด้านซ้าย
- ตารางกว้างให้เลื่อนแนวนอนในกรอบของตัวเอง หน้าเว็บต้องไม่มี scroll แนวนอน
- จุดเด่นจุดเดียวคือ **บัตรยืม** บนหน้าแรกสมาชิก ส่วนอื่นเรียบ ใช้ตารางและรายการ ไม่ใช้การ์ดตกแต่ง ไม่ใช้ gradient
- ข้อความบนปุ่มเป็นคำกริยาที่บอกผล และใช้คำเดียวกันตลอด flow (ปุ่ม "คืนเครื่อง" → toast "คืนเครื่องแล้ว รอผู้ดูแลยืนยันรับคืน")

### บัตรยืม (`loanTicket.js`)

| เงื่อนไข | สี | ข้อความหลัก | ปุ่ม |
| --- | --- | --- | --- |
| `borrowing` เหลือ > 60 นาที | ink | "เหลือเวลาอีก X ชม. Y นาที" | ต่อเวลา (ถ้า `actions.canExtend`), คืนเครื่อง |
| `borrowing` เหลือ ≤ 60 นาที | hold | "เหลืออีก Y นาที ต้องคืนแล้ว" | เหมือนข้างบน |
| `overdue` | alert | "เกินกำหนด X ชม. Y นาที" | คืนเครื่อง |
| `return_pending` | muted | "คืนแล้ว รอผู้ดูแลยืนยันรับคืน" | ไม่มี |

- ตัวนับถอยหลังคำนวณจาก `dueAt` ฝั่ง client อัปเดตทุก 30 วินาที ใช้ `aria-live="polite"` แต่ประกาศเฉพาะเมื่อเปลี่ยนสถานะ ไม่ประกาศทุกนาที
- ข้อมูลบัตรมาจาก `GET /me/loans?status=borrowing`, `overdue`, `return_pending` แล้วเรียก `GET /loans/:id` (L2) เพื่อเอา `actions`
- ค่า 60 นาทีใช้ค่าคงที่ใน `config.js` (`DUE_SOON_MINUTES = 60`) เพราะ S1 ไม่ส่ง `notifyBeforeDueMinutes` มา

### ฟอร์มวันเวลา

- ใช้ `<input type="datetime-local">` (ไม่ใช้ library) กำหนด `min`/`max` จาก settings (S1) และ `actions.maxExtendDueAt`
- **ตีความค่าที่ผู้ใช้เลือกเป็นเวลาไทยเสมอ** แปลงเป็น `YYYY-MM-DDTHH:mm:00+07:00` เอง ไม่ใช้ timezone ของเครื่อง
- แสดงเวลาด้วย `Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', ... })` ปี พ.ศ.

---

## 5. หน้าจอและ Endpoint ที่ใช้

### หน้าทั่วไป

| หน้า | Endpoint | รายละเอียด |
| --- | --- | --- |
| login.html | A2 | แสดงข้อความ `INVALID_CREDENTIALS` / `ACCOUNT_SUSPENDED` จาก backend |
| register.html | A1 | สมัครแล้วใช้ token ที่ได้เข้าใช้งานทันที · แสดง `EMAIL_TAKEN`, `MEMBER_CODE_TAKEN` ใต้ช่องที่เกี่ยวข้อง |
| profile.html | M1, M2, M3, M4 | แก้ได้เฉพาะ ชื่อ นามสกุล เบอร์โทร รูป (อีเมลและรหัสสมาชิกแสดงแบบอ่านอย่างเดียว) · เปลี่ยนรหัสผ่านเป็นฟอร์มแยก |
| notifications.html | M7, M9, M10 | รายการแบ่งหน้า, กรองยังไม่อ่าน, ปุ่มอ่านทั้งหมด, คลิกแล้วไปหน้าที่เกี่ยวข้อง |
| ทุกหน้า (header) | M8 | polling ทุก 60 วินาที และเมื่อโหลดหน้า หยุด polling เมื่อ tab ถูกซ่อน (`visibilitychange`) |

### สมาชิก

| หน้า | Endpoint | รายละเอียด |
| --- | --- | --- |
| member/home.html | M5, L2, L3, L4, M6, R3, R4, S1 | บัตรยืม · ต่อเวลา (modal) · คืนเครื่อง (confirm) · การจองสถานะ `upcoming`/`active` · ปุ่ม **"รับเครื่อง"** เมื่อจองเป็น `active` พร้อมแสดง `pickupDeadline` · ยกเลิกจอง |
| member/notebooks.html | N1, B1, D1, N2 | แท็บ 1 "ค้นหาเครื่อง": keyword, ยี่ห้อ, รุ่น, สถานะ, แบ่งหน้า (เก็บ filter ใน query string) · แท็บ 2 "หาเครื่องว่างตามช่วงเวลา": เลือกเริ่ม–สิ้นสุด แล้วเรียก N2 กดจองจากผลลัพธ์ได้ทันที |
| member/notebook.html | N4, L1, R1, S1 | สเปก + สถานะ · ปุ่ม "ยืมทันที" แสดงเมื่อ `available` · ปุ่ม "จองล่วงหน้า" แสดงเมื่อสภาพพร้อมใช้ · ปิดปุ่มยืมพร้อมเหตุผลถ้ายืมครบ `maxActiveLoansPerUser` แล้ว |
| member/history.html | M5, M6 | 2 แท็บ, กรองตามสถานะ, ป้าย "คืนช้า" เมื่อ `isLate` |

### แอดมิน

| หน้า | Endpoint | รายละเอียด |
| --- | --- | --- |
| admin/returns.html | L6, N3, L7, R4 | ช่องสแกน/พิมพ์รหัสครุภัณฑ์ (N3) → เลือกรายการ · เลือกสภาพ (ปกติ/เสียหาย) · เสียหายบังคับหมายเหตุ 1–500 ตัว · ปุ่ม "บันทึกรับคืนเครื่องที่ยังไม่กดคืน" ใช้ `activeLoan` จาก N3 และให้ระบุ `returnRequestedAt` ได้ · หลังยืนยัน ถ้า `warnings.affectedReservations` ไม่ว่าง ให้ถามว่าจะยกเลิกการจองเหล่านั้นไหม แล้วเรียก R4 ทีละรายการพร้อมเหตุผล |
| admin/notebooks.html | N1, N4–N8, D1 | ตาราง + filter (รวม `conditionStatus`, `includeDeleted`) · ฟอร์มเพิ่ม/แก้ใน modal · หลัง N6 ถ้ามี `warnings.affectedReservations` ถามเหมือนหน้ารับคืน · ลบไม่ได้แสดงข้อความจาก `NOTEBOOK_HAS_COMMITMENTS` · ปุ่มกู้คืนสำหรับรายการที่ลบแล้ว |
| admin/models.html | D1–D7, B1 | ฟอร์มตามกฎ: `ramGb` 1–256, `storageGb` 1–8192, `screenInch` 10.0–18.0 · อัปโหลดรูป |
| admin/brands.html | B2–B6 | CRUD + กู้คืน · `BRAND_IN_USE` แสดงจำนวนรุ่นที่ใช้อยู่ |
| admin/loans.html | L5, L2, L8 | filter: สถานะ, คืนช้า, ช่วงวันที่ · ยกเลิกต้องกรอกเหตุผล |
| admin/reservations.html | R5, R4 | filter: สถานะ, ช่วงวันที่ · ยกเลิกต้องกรอกเหตุผล |
| admin/users.html | U1–U7 | ระงับ/เปิดใช้งาน/ลบ/กู้คืน · แสดง `activeLoanCount` · แสดงข้อความ `CANNOT_MODIFY_SELF`, `LAST_ADMIN`, `USER_HAS_ACTIVE_LOANS` · **ยังไม่ทำการเปลี่ยน role** (ดูข้อ 9) |
| admin/reports.html | P1–P5 | สรุปสถานะ (P1) เป็นตัวเลขในตารางเดียว · 3 รายงานเป็นตาราง · รายงานรายเดือน (P5) เป็นตาราง + กราฟแท่ง SVG ที่เขียนเอง (เลือกช่วงไม่เกิน 24 เดือน) |
| admin/settings.html | S2, S3 | ฟอร์ม 5 ค่าตามช่วงใน spec ข้อ 4.3 · บันทึกครั้งเดียวทั้งหมด |
| admin/audit-logs.html | G1, G2 | filter: ผู้กระทำ, action, ตาราง, ช่วงวันที่ · เปิดรายละเอียดแสดง `oldValues` เทียบ `newValues` |

---

## 6. Validation ฝั่ง frontend (`validate.js`)

ทุกฟังก์ชันเป็น pure function รับ `now` เป็น parameter (ไม่เรียก `Date.now()` เอง) คืน `{ valid: boolean, errors: { [field]: message } }`

| ฟอร์ม | กฎ |
| --- | --- |
| สมัครสมาชิก | email บังคับ รูปแบบอีเมล ≤ 255 · password ≥ 8 ตัว มีทั้งตัวอักษรและตัวเลข · firstName/lastName 1–100 · phone `^0\d{9}$` · memberCode ไม่บังคับ 1–30 |
| เข้าสู่ระบบ | email, password บังคับ |
| แก้โปรไฟล์ | firstName/lastName 1–100 · phone `^0\d{9}$` |
| เปลี่ยนรหัสผ่าน | รหัสใหม่ตามนโยบาย · ไม่ซ้ำรหัสเดิม · ช่องยืนยันตรงกัน |
| ยืมทันที | `dueAt > now` · `dueAt - now ≤ maxLoanHours` |
| ต่อเวลา | `newDueAt > dueAt เดิม` · `newDueAt ≤ actions.maxExtendDueAt` |
| จอง | `startAt > now` · `startAt ≤ now + reservationMaxDaysAhead วัน` · `endAt > startAt` · `endAt - startAt ≤ maxLoanHours` |
| ยืนยันรับคืน | ต้องเลือกสภาพ · `damaged` บังคับหมายเหตุ 1–500 · `returnRequestedAt` (ถ้าระบุ) อยู่ระหว่าง `borrowedAt` ถึง `now` |
| ยกเลิกโดยแอดมิน | เหตุผลบังคับ |
| รุ่น / เครื่อง / ยี่ห้อ | ตามกฎใน spec ข้อ 4.4–4.6 |
| ตั้งค่า | ตามช่วงใน spec ข้อ 4.3 |
| รูปภาพ | jpg/png/webp ≤ 2 MB |

แสดง error ใต้ช่องที่ผิด (`aria-describedby`) และย้ายโฟกัสไปช่องแรกที่ผิด ถ้า backend ตอบ `VALIDATION_ERROR` ให้วาง `details[].message` ใต้ช่องตาม `details[].field`

---

## 7. การจัดการ Error (`errors.js`)

ค่าเริ่มต้น: แสดง `error.message` เป็น toast ส่วน code ต่อไปนี้มีการกระทำเพิ่ม

| Code | การกระทำใน UI |
| --- | --- |
| `UNAUTHORIZED` | ลบ session → login พร้อม `next` |
| `ACCOUNT_SUSPENDED` | ลบ session → login แสดงข้อความ |
| `VALIDATION_ERROR` | วาง error ใต้ช่องตาม `details` |
| `OWN_RESERVATION_OVERLAP` | ข้อความ + ปุ่ม "ไปที่การจองของฉัน" (ไป `member/home.html`) |
| `RESERVATION_CONFLICT` (L1) | ข้อความ + "ยืมได้ถึง {details.availableUntil}" และปุ่มตั้งเวลาคืนเป็นค่านั้น |
| `EXTEND_CONFLICT_RESERVATION`, `LOAN_DURATION_EXCEEDED` | ข้อความ + "ต่อได้ถึง {details.maxDueAt}" และปุ่มตั้งค่านั้น |
| `LOAN_LIMIT_REACHED` | ข้อความ + ปุ่ม "ไปที่เครื่องที่ยืมอยู่" |
| `NOTEBOOK_ALREADY_BORROWED`, `NOTEBOOK_NOT_AVAILABLE`, `LOAN_STATE_CHANGED`, `RETURN_ALREADY_REQUESTED`, `LOAN_ALREADY_RETURNED` | ข้อความ + โหลดข้อมูลของหน้าใหม่ |
| `NOTEBOOK_HAS_COMMITMENTS`, `BRAND_IN_USE`, `MODEL_IN_USE` | ข้อความ + ตัวเลขจาก `details` |
| `NETWORK_ERROR`, `INTERNAL_ERROR` | ข้อความ + ปุ่ม "ลองใหม่" |

ป้องกันกดซ้ำ: ปุ่มที่ส่ง request ต้องถูกปิดและแสดงสถานะกำลังทำงานจนกว่าจะได้ผลตอบกลับ

---

## 8. การทดสอบ

### เครื่องมือ

| ชั้น | เครื่องมือ | ทดสอบอะไร |
| --- | --- | --- |
| Unit | Vitest | `validate.js`, `datetime.js`, `status.js`, `errors.js`, `auth.js`, `guard.js` |
| Component | Vitest + jsdom | statusBadge, countdown, loanTicket, modal, barcodeInput, dataTable |
| E2E | Playwright + mock API | flow ครบเส้น บน viewport 1280px และ 375px |

ใช้ fake timer ของ Vitest และ `mockClock` ควบคุมเวลา ผล test ต้องไม่ขึ้นกับเวลาที่รัน

### Test cases ที่ต้องมีครบ

| ID | กรณีทดสอบ | ผลที่คาดหวัง |
| --- | --- | --- |
| V-01 | เวลาคืนในอดีต | error ใต้ช่อง ปุ่มยืนยันกดไม่ได้ |
| V-02 | เวลาคืน = now + 24 ชม. 1 นาที | error เกิน 24 ชั่วโมง |
| V-03 | เวลาคืน = now + 24 ชม. พอดี | ผ่าน |
| V-04 | จองเริ่ม now + 7 วัน 1 นาที | error จองล่วงหน้าเกิน 7 วัน |
| V-05 | จองโดย endAt ≤ startAt | error |
| V-06 | ต่อเวลาเกิน `maxExtendDueAt` | error และแสดงเวลาสูงสุดที่ต่อได้ |
| V-07 | รหัสผ่าน "abcdefgh" (ไม่มีตัวเลข), เบอร์ "081234567" (9 หลัก) | error ตรงช่อง ไม่ส่ง request |
| V-08 | settings `maxLoanHours` = 12 | ฟอร์มยืมจำกัดที่ 12 ชม. |
| V-09 | เลือกสภาพ "เสียหาย" ไม่กรอกหมายเหตุ | ปุ่มยืนยันรับคืนกดไม่ได้ |
| B-01 | สมาชิกยืมเครื่องว่าง | บัตรยืมแสดงบนหน้าแรก |
| B-02 | สมาชิกที่ยืมครบโควตาเปิดเครื่องอื่น | ปุ่มยืมถูกปิดพร้อมเหตุผล |
| B-03 | mock ตอบ `RESERVATION_CONFLICT` พร้อม `availableUntil` | แสดงเวลาที่ยืมได้ถึง กดปุ่มแล้วช่องเวลาคืนเปลี่ยนเป็นค่านั้น |
| B-04 | mock ตอบ `NOTEBOOK_ALREADY_BORROWED` | toast + ข้อมูลเครื่องโหลดใหม่ |
| B-05 | mock ตอบ `OWN_RESERVATION_OVERLAP` | มีปุ่ม "ไปที่การจองของฉัน" |
| B-06 | กดปุ่มยืนยันยืม 2 ครั้งเร็วๆ | ส่ง request ครั้งเดียว |
| C-01 | เหลือ 61 นาที แล้วเลื่อนเวลา 2 นาที | บัตรเปลี่ยนเป็นสี hold |
| C-02 | เลยกำหนดคืน | บัตรเป็นสี alert ข้อความ "เกินกำหนด" ไม่มีปุ่มต่อเวลา |
| E-01 | ต่อเวลาสำเร็จ | กำหนดคืนบนบัตรอัปเดต |
| E-02 | mock ตอบ `EXTEND_CONFLICT_RESERVATION` | แสดง `maxDueAt` กำหนดคืนเดิมไม่เปลี่ยน |
| R-01 | กดคืนแล้วยืนยัน | บัตรเป็น "รอผู้ดูแลยืนยันรับคืน" ไม่มีปุ่ม |
| R-02 | กดคืนหลังเกินกำหนด แอดมินยืนยัน | ประวัติแสดงป้าย "คืนช้า" |
| S-01 | หาเครื่องว่างตามช่วงเวลาแล้วจอง | การจองแสดงบนหน้าแรกและหน้าประวัติ |
| S-02 | ยกเลิกการจองของตัวเอง | สถานะเป็น "ยกเลิก" ปุ่มยกเลิกหายไป |
| S-03 | การจองถึงเวลา (`active`) กด "รับเครื่อง" | ได้บัตรยืมที่ `dueAt` = `endAt` ของการจอง |
| S-04 | กดรับเครื่องหลังเลย `pickupDeadline` | แสดงข้อความ `RESERVATION_EXPIRED` |
| A-01 | สแกนรหัสเครื่องที่รอรับคืน | รายการนั้นถูกเลือกและเลื่อนมาให้เห็น |
| A-02 | สแกนรหัสที่ไม่มีในระบบ | แสดงข้อความ `NOTEBOOK_NOT_FOUND` |
| A-03 | รับคืนแบบเสียหาย มีการจองในอนาคต | ถามว่าจะยกเลิกการจองไหม ตอบตกลงแล้วการจองเป็น "ยกเลิก" |
| A-04 | บันทึกรับคืนเครื่องที่สมาชิกยังไม่กดคืน พร้อมระบุเวลา | รายการเป็น "คืนแล้ว" และคำนวณคืนช้าตามเวลาที่ระบุ |
| A-05 | ลบเครื่องที่มีการจองในอนาคต | แสดงข้อความ `NOTEBOOK_HAS_COMMITMENTS` พร้อมจำนวน |
| A-06 | ยกเลิกรายการยืมโดยไม่กรอกเหตุผล | ปุ่มยืนยันกดไม่ได้ |
| A-07 | ระงับบัญชีตัวเอง | แสดงข้อความ `CANNOT_MODIFY_SELF` |
| A-08 | แก้ settings ค่าหนึ่งผิดช่วง | ไม่บันทึกค่าใดเลย แสดง error ตรงช่อง |
| P-01 | สมาชิกเปิด `admin/users.html` ตรงๆ | redirect ไป `member/home.html` |
| P-02 | `expiresAt` ผ่านไปแล้ว เปิดหน้าใดก็ได้ | ไปหน้า login แล้วกลับหน้าเดิมหลัง login |
| P-03 | login ด้วยบัญชีถูกระงับ | แสดงข้อความ `ACCOUNT_SUSPENDED` |
| P-04 | `login.html?next=https://evil.example` | หลัง login ไปหน้าแรกตาม role ไม่ไปลิงก์ภายนอก |
| P-05 | ยังไม่ login เปิด `member/home.html` | ไปหน้า login พร้อม `next` |
| N-01 | mock เพิ่มแจ้งเตือนใหม่ | ภายใน 60 วินาที ตัวเลขบนกระดิ่งเพิ่มขึ้น |
| N-02 | กดอ่านแจ้งเตือน / อ่านทั้งหมด | ตัวเลขลดลงถูกต้อง |
| T-01 | browser ตั้ง timezone เป็น UTC | เวลาที่แสดงและที่ส่งไป API เป็นเวลาไทย (+07:00) |
| X-01 | ข้อมูลชื่อผู้ใช้มี `<script>` | แสดงเป็นข้อความ ไม่ถูกรัน |
| M-01 | เปิดทุกหน้าที่ 375px | ไม่มี scroll แนวนอน เมนูอยู่ล่าง |
| X-02 | ใช้งานด้วยคีย์บอร์ดอย่างเดียว | เห็น focus ทุกจุด modal กักโฟกัส กด Esc ปิดได้ |
| D-01 | เปิด `?mockReset=1` | ข้อมูล mock กลับเป็นค่าตั้งต้น |

---

## 9. สิ่งที่ spec ยังไม่รองรับ (อย่าเดา ให้ทำตามนี้)

| เรื่อง | สิ่งที่ต้องทำ |
| --- | --- |
| เปลี่ยน role ผู้ใช้ (U3 รับ `roleId` แต่ไม่มี endpoint รายการ role) | ยังไม่ทำ UI เปลี่ยน role ใส่ comment `TODO` ไว้ |
| Export รายงาน PDF/Excel | ยังไม่ทำ |
| ลืมรหัสผ่าน / แอดมินรีเซ็ตรหัสผ่าน | ยังไม่ทำ ไม่มีลิงก์ในหน้า login |
| เวลาทำการ | ยังไม่จำกัด เลือกเวลาได้ตลอด 24 ชม. |
| `notifyBeforeDueMinutes` ไม่อยู่ใน S1 | ใช้ `DUE_SOON_MINUTES` ใน `config.js` |
| CORS ระหว่าง XAMPP (port 80) กับ Express (port 3000) | เป็นงาน backend ให้เขียนไว้ใน README ว่า backend ต้องเปิด CORS ให้ origin ของ frontend |

ถ้าเจอเรื่องอื่นที่ spec ไม่ชัด ให้เพิ่มลงตารางนี้ตอนส่งงาน

---

## Verification และรูปแบบการส่งงาน

ทำงานเป็น 4 รอบ **จบแต่ละรอบแล้วหยุดรอให้ตรวจ** ห้ามทำรอบถัดไปเอง

| รอบ | ขอบเขต |
| --- | --- |
| 1 | `package.json`, config ของ test, `tokens.css`/`base.css`/`components.css`, `config.js`, `core/*`, `utils/*`, `mock/*`, components ทั้งหมด, `index.html`, `login.html`, `register.html` + unit/component test ที่เกี่ยวข้อง (V, P, T, X-01, D-01) |
| 2 | หน้าสมาชิกทั้งหมด + `profile.html` + `notifications.html` + E2E ชุด B, C, E, R, S, N |
| 3 | หน้าแอดมินทั้งหมด + E2E ชุด A |
| 4 | E2E ชุด M-01, X-02 + `README.md` + ตรวจรวม |

ในแต่ละรอบให้ส่งงานแบบนี้:

1. รายการไฟล์ที่สร้างหรือแก้ในรอบนี้
2. เนื้อหาเต็มของทุกไฟล์ แต่ละไฟล์ขึ้นต้นด้วยหัวข้อเป็น path แล้วตามด้วย code block (ไม่ตัดทอน ไม่เขียนว่า "เหมือนเดิม")
3. ถ้าแก้ไฟล์จากรอบก่อน ให้ส่งเฉพาะส่วนที่เปลี่ยนเป็นข้อความเดิมและข้อความใหม่ที่วางแทนได้ทันที
4. คำสั่งรัน test ของรอบนี้ และตาราง test case ID ที่ครอบคลุม พร้อมผลที่คาดหวัง
5. วิธีเปิดดูหน้าจอด้วย mock (ไม่เกิน 3 ขั้นตอน)
6. สิ่งที่ spec ยังไม่รองรับที่พบเพิ่มในรอบนี้

### Checklist ก่อนส่งแต่ละรอบ

- [ ] ไม่มี hash router หรือการ render หลายหน้าในไฟล์ HTML เดียว
- [ ] ทุก request ตรง method, path, field และ error code ใน `http-api-spec.md`
- [ ] ไม่มี `innerHTML` กับข้อมูลที่มาจากผู้ใช้หรือ API
- [ ] ไม่มี library runtime นอกจาก Google Fonts
- [ ] ทุกหน้ามี guard, layout, loading state, empty state และ error state
- [ ] ข้อความทั้งหมดเป็นภาษาไทย สถานะมีข้อความกำกับ
- [ ] เวลาที่แสดงและที่ส่งเป็นเวลาไทย (+07:00)
