import { expect, test } from '@playwright/test';
import { editDb, HOUR, loginAs, MIN, T0, toLocalInput } from './helpers.js';

const t0 = T0.getTime();

test.describe('บัตรยืม / ยืม (B, C, E, R)', () => {
  test('B-01 สมาชิกยืมเครื่องว่าง -> บัตรยืมแสดงบนหน้าแรก', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await expect(page.getByText('ตอนนี้คุณไม่ได้ยืมเครื่องไหนอยู่')).toBeVisible();

    await page.goto('member/notebooks.html');
    await page.getByRole('link', { name: 'NB-2025-0001' }).click();
    await expect(page.getByRole('heading', { name: /NB-2025-0001/ })).toBeVisible();
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 + 3 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();

    await page.waitForURL(/member\/home\.html$/);
    const ticket = page.locator('.loan-ticket');
    await expect(ticket).toContainText('NB-2025-0001');
    await expect(ticket).toContainText('เหลือเวลาอีก');
    await expect(ticket).toContainText('กำหนดคืน 8 ต.ค. 2569 19:30 น.');
  });

  test('V-01 เวลาคืนในอดีต -> error ใต้ช่อง ไม่ส่ง request', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 - HOUR));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();
    await expect(page.locator('#f-dueAt-err')).toHaveText('เวลาคืนต้องเป็นเวลาในอนาคต');
    expect(await page.evaluate(() => window.__mock.getDb().loans.filter((l) => l.notebookId === 1 && l.status === 'borrowing').length)).toBe(0);
  });

  test('V-02 เวลาคืน now + 24 ชม. 1 นาที -> error เกิน 24 ชั่วโมง', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 + 24 * HOUR + MIN));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();
    await expect(page.locator('#f-dueAt-err')).toContainText('24 ชั่วโมง');
  });

  test('V-08 settings maxLoanHours = 12 -> ฟอร์มยืมจำกัดที่ 12 ชม.', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await editDb(page, (db) => { db.settings.maxLoanHours = 12; });
    await page.goto('member/notebook.html?id=1');
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await expect(page.locator('#f-dueAt-hint')).toContainText('12 ชั่วโมง');
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 + 13 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();
    await expect(page.locator('#f-dueAt-err')).toContainText('12 ชั่วโมง');
  });

  test('B-02 ยืมครบโควตาแล้วเปิดเครื่องอื่น -> ปุ่มยืมถูกปิดพร้อมเหตุผล', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    await page.goto('member/notebook.html?id=1');
    const button = page.getByRole('button', { name: 'ยืมทันที' });
    await expect(button).toBeDisabled();
    await expect(page.locator('#borrow-reason')).toContainText('ยืมครบ 1 เครื่องแล้ว');
  });

  test('B-03 RESERVATION_CONFLICT -> แสดงเวลาที่ยืมได้ถึง กดปุ่มแล้วช่องเวลาคืนเปลี่ยน', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=2');
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 + 24 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();

    const toast = page.locator('.toast-error');
    await expect(toast).toContainText('ช่วงเวลานี้มีผู้จองไว้แล้ว');
    await expect(toast).toContainText('ยืมได้ถึง 9 ต.ค. 2569 09:00 น.');
    await toast.getByRole('button', { name: 'ตั้งเวลาคืนเป็นเวลานี้' }).click();
    await expect(page.getByLabel('เวลาคืน')).toHaveValue('2026-10-09T09:00');

    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();
    await page.waitForURL(/member\/home\.html$/);
    await expect(page.locator('.loan-ticket')).toContainText('NB-2025-0002');
  });

  test('B-04 NOTEBOOK_ALREADY_BORROWED -> toast + ข้อมูลเครื่องโหลดใหม่', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await expect(page.locator('h1 .badge')).toHaveText('ว่าง');
    // มีคนอื่นยืมตัดหน้าระหว่างที่เราเปิดฟอร์มอยู่
    await editDb(page, (db, now) => {
      db.loans.push({ id: 99, userId: 3, notebookId: 1, reservationId: null, borrowedAt: now, dueAt: now + 3600000, returnRequestedAt: null, returnedAt: null, receivedBy: null, returnCondition: null, returnNote: null, cancelledAt: null, cancelReason: null, status: 'borrowing' });
    }, t0);
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 + 2 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();
    await expect(page.locator('.toast-error')).toContainText('เครื่องนี้ถูกยืมอยู่');
    await expect(page.locator('h1 .badge')).toHaveText('ถูกยืม');
    await expect(page.getByRole('button', { name: 'ยืมทันที' })).toHaveCount(0);
  });

  test('B-05 OWN_RESERVATION_OVERLAP -> มีปุ่ม "ไปที่การจองของฉัน"', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await expect(page.getByRole('button', { name: 'ยืมทันที' })).toBeVisible();
    await page.evaluate(() => window.__mock.queueError('POST', '^/loans$', { code: 'OWN_RESERVATION_OVERLAP', details: { reservationId: 1 } }));
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 + HOUR));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).click();
    const toast = page.locator('.toast-error');
    await expect(toast).toContainText('คุณมีการจองเครื่องนี้ในช่วงเวลานี้');
    await toast.getByRole('button', { name: 'ไปที่การจองของฉัน' }).click();
    await page.waitForURL(/member\/home\.html$/);
  });

  test('B-06 กดยืนยันยืม 2 ครั้งเร็วๆ -> ส่ง request ครั้งเดียว', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await page.getByLabel('เวลาคืน').fill(toLocalInput(t0 + 2 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันยืม' }).dblclick();
    await page.waitForURL(/member\/home\.html$/);
    const loans = await page.evaluate(() => JSON.parse(localStorage.getItem('nl.mockDb')).loans.filter((l) => l.notebookId === 1 && l.userId === 2 && l.status === 'borrowing').length);
    expect(loans).toBe(1);
  });

  test('C-01 เหลือ 61 นาที แล้วเลื่อนเวลา 2 นาที -> บัตรเปลี่ยนเป็นสี hold', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    await editDb(page, (db, now) => { db.loans.find((l) => l.id === 1).dueAt = now + 61 * 60000; }, t0);
    await page.reload();
    const ticket = page.locator('.loan-ticket');
    await expect(ticket).toHaveAttribute('data-tone', 'ink');
    await page.clock.fastForward(2 * MIN);
    await expect(ticket).toHaveAttribute('data-tone', 'hold');
    await expect(ticket).toContainText('ต้องคืนแล้ว');
  });

  test('C-02 เลยกำหนดคืน -> บัตรสี alert "เกินกำหนด" ไม่มีปุ่มต่อเวลา', async ({ page }) => {
    await loginAs(page, 'member4@example.com');
    const ticket = page.locator('.loan-ticket');
    await expect(ticket).toHaveAttribute('data-tone', 'alert');
    await expect(ticket).toContainText('เกินกำหนด 25 นาที');
    await expect(ticket.getByRole('button', { name: 'ต่อเวลา' })).toHaveCount(0);
    await expect(ticket.getByRole('button', { name: 'คืนเครื่อง' })).toBeVisible();
  });

  test('E-01 ต่อเวลาสำเร็จ -> กำหนดคืนบนบัตรอัปเดต', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    const ticket = page.locator('.loan-ticket');
    await expect(ticket).toContainText('กำหนดคืน 8 ต.ค. 2569 19:30 น.');
    await ticket.getByRole('button', { name: 'ต่อเวลา' }).click();
    await page.getByLabel('เวลาคืนใหม่').fill(toLocalInput(t0 + 5 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันต่อเวลา' }).click();
    await expect(page.locator('.toast')).toContainText('ต่อเวลาแล้ว');
    await expect(ticket).toContainText('กำหนดคืน 8 ต.ค. 2569 21:30 น.');
    await expect(ticket.locator('.ticket-time')).toContainText('เหลือเวลาอีก 4 ชม.');
  });

  test('V-06 ต่อเวลาเกินที่ต่อได้ -> error และแสดงเวลาสูงสุด', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    // loan 1 ยืมเมื่อ 15:30 -> เพดาน 24 ชม. = 9 ต.ค. 15:30
    await page.locator('.loan-ticket').getByRole('button', { name: 'ต่อเวลา' }).click();
    await page.getByLabel('เวลาคืนใหม่').fill('2026-10-09T15:31');
    await page.getByRole('button', { name: 'ยืนยันต่อเวลา' }).click();
    await expect(page.locator('#f-newDueAt-err')).toContainText('ต่อเวลาได้ไม่เกิน 9 ต.ค. 2569 15:30 น.');
  });

  test('E-02 EXTEND_CONFLICT_RESERVATION -> แสดง maxDueAt กำหนดคืนเดิมไม่เปลี่ยน', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    // มีคนจองเครื่องต่อจากเรา 21:00 แต่ maxExtendDueAt ที่หน้าจอรู้ยังเป็นเพดาน 24 ชม. (จัดฉากหลังโหลดหน้า)
    await editDb(page, (db, now) => {
      db.reservations.push({ id: 90, userId: 2, notebookId: 3, startAt: now + 5 * 3600000, endAt: now + 7 * 3600000, pickupDeadline: now + 5.5 * 3600000, status: 'upcoming', loanId: null, cancelledAt: null, cancelReason: null, createdAt: now });
    }, t0);
    const ticket = page.locator('.loan-ticket');
    await ticket.getByRole('button', { name: 'ต่อเวลา' }).click();
    await page.getByLabel('เวลาคืนใหม่').fill(toLocalInput(t0 + 6 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันต่อเวลา' }).click();
    const toast = page.locator('.toast-error');
    await expect(toast).toContainText('มีผู้จองเครื่องต่อจากคุณ');
    await expect(toast).toContainText('ต่อได้ถึง 8 ต.ค. 2569 21:30 น.');
    await expect(ticket).toContainText('กำหนดคืน 8 ต.ค. 2569 19:30 น.');
  });

  test('R-01 กดคืนแล้วยืนยัน -> บัตรเป็น "รอผู้ดูแลยืนยันรับคืน" ไม่มีปุ่ม', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    const ticket = page.locator('.loan-ticket');
    await ticket.getByRole('button', { name: 'คืนเครื่อง' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'คืนเครื่อง' }).click();
    await expect(page.locator('.toast')).toContainText('คืนเครื่องแล้ว รอผู้ดูแลยืนยันรับคืน');
    await expect(ticket).toHaveAttribute('data-tone', 'muted');
    await expect(ticket).toContainText('คืนแล้ว รอผู้ดูแลยืนยันรับคืน');
    await expect(ticket.getByRole('button')).toHaveCount(0);
  });

  test('R-02 กดคืนหลังเกินกำหนด แอดมินยืนยัน -> ประวัติแสดงป้าย "คืนช้า"', async ({ page }) => {
    await loginAs(page, 'member4@example.com');
    const ticket = page.locator('.loan-ticket');
    await ticket.getByRole('button', { name: 'คืนเครื่อง' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'คืนเครื่อง' }).click();
    await expect(ticket).toContainText('รอผู้ดูแลยืนยันรับคืน');

    // แอดมินยืนยัน (ผ่าน mock API โดยตรง เพราะหน้าแอดมินทดสอบแยกในชุด A)
    await page.evaluate(async () => {
      const { handle } = await import('/assets/js/mock/mockApi.js');
      const login = await handle({ method: 'POST', path: '/auth/login', body: { email: 'admin@example.com', password: 'Passw0rd' } });
      await handle({ method: 'POST', path: '/loans/2/confirm-return', token: login.body.data.token, body: { returnCondition: 'normal' } });
    });
    await page.goto('member/history.html');
    const row = page.locator('tbody tr', { hasText: 'NB-2025-0008' });
    await expect(row).toContainText('คืนแล้ว');
    await expect(row).toContainText('คืนช้า');
  });
});

test.describe('การจอง (S)', () => {
  test('S-01 หาเครื่องว่างตามช่วงเวลาแล้วจอง -> แสดงบนหน้าแรกและหน้าประวัติ', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebooks.html');
    await page.getByRole('tab', { name: 'หาเครื่องว่างตามช่วงเวลา' }).click();
    await page.getByLabel('เริ่มใช้งาน').fill('2026-10-10T13:00');
    await page.getByLabel('สิ้นสุด', { exact: true }).fill('2026-10-10T16:00');
    await page.getByRole('button', { name: 'ค้นหาเครื่องว่าง' }).click();

    const row = page.locator('tbody tr', { hasText: 'NB-2025-0001' });
    await expect(row).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'NB-2025-0005' })).toHaveCount(0); // เครื่องเสียหาย
    await row.getByRole('button', { name: 'จองเครื่องนี้' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ยืนยันจอง' }).click();
    await expect(page.locator('.toast')).toContainText('จองเครื่องแล้ว');
    await expect(page.locator('tbody tr', { hasText: 'NB-2025-0001' })).toHaveCount(0);

    await page.goto('member/home.html');
    await expect(page.locator('[data-reservation-id]', { hasText: 'NB-2025-0001' })).toContainText('10 ต.ค. 2569 13:00 น.');
    await page.goto('member/history.html?tab=reservations');
    await expect(page.locator('tbody tr', { hasText: 'NB-2025-0001' }).first()).toContainText('รอใช้');
  });

  test('V-04 จองล่วงหน้าเกิน 7 วัน -> error', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await page.getByRole('button', { name: 'จองล่วงหน้า' }).click();
    await page.getByLabel('เริ่มใช้งาน').fill(toLocalInput(t0 + 7 * 24 * HOUR + MIN));
    await page.getByLabel('สิ้นสุด', { exact: true }).fill(toLocalInput(t0 + 7 * 24 * HOUR + HOUR));
    await page.getByRole('button', { name: 'ยืนยันจอง' }).click();
    await expect(page.locator('#f-startAt-err')).toContainText('7 วัน');
  });

  test('V-05 endAt <= startAt -> error', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await page.getByRole('button', { name: 'จองล่วงหน้า' }).click();
    await page.getByLabel('เริ่มใช้งาน').fill(toLocalInput(t0 + 2 * HOUR));
    await page.getByLabel('สิ้นสุด', { exact: true }).fill(toLocalInput(t0 + 2 * HOUR));
    await page.getByRole('button', { name: 'ยืนยันจอง' }).click();
    await expect(page.locator('#f-endAt-err')).toContainText('หลังเวลาเริ่ม');
  });

  test('S-02 ยกเลิกการจองของตัวเอง -> สถานะเป็น "ยกเลิก" ปุ่มยกเลิกหายไป', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    const row = page.locator('[data-reservation-id="3"]');
    await expect(row).toContainText('NB-2025-0012');
    await row.getByRole('button', { name: 'ยกเลิกจอง' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ยกเลิกการจอง' }).click();
    await expect(page.locator('.toast')).toContainText('ยกเลิกการจองแล้ว');
    await expect(page.locator('[data-reservation-id="3"]')).toHaveCount(0);

    await page.goto('member/history.html?tab=reservations');
    const hist = page.locator('tbody tr', { hasText: 'NB-2025-0012' }).first();
    await expect(hist).toContainText('ยกเลิก');
    await expect(hist.getByRole('button')).toHaveCount(0);
  });

  test('S-03 การจองถึงเวลา กด "รับเครื่อง" -> ได้บัตรยืมที่ dueAt = endAt ของการจอง', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    const row = page.locator('[data-reservation-id="1"]');
    await expect(row).toContainText('ถึงเวลาใช้');
    await expect(row).toContainText('รับเครื่องได้ถึง 16:55 น.');
    await row.getByRole('button', { name: 'รับเครื่อง' }).click();
    const ticket = page.locator('.loan-ticket');
    await expect(ticket).toContainText('NB-2025-0004');
    await expect(ticket).toContainText('กำหนดคืน 8 ต.ค. 2569 19:30 น.'); // endAt = now + 3 ชม.
  });

  test('S-04 กดรับเครื่องหลังเลย pickupDeadline -> แสดงข้อความ RESERVATION_EXPIRED', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await expect(page.locator('[data-reservation-id="1"]')).toContainText('ถึงเวลาใช้');
    await page.clock.fastForward(31 * MIN);
    await page.locator('[data-reservation-id="1"]').getByRole('button', { name: 'รับเครื่อง' }).click();
    await expect(page.locator('.toast-error')).toContainText('การจองหมดอายุแล้ว');
    await expect(page.locator('[data-reservation-id="1"]')).toHaveCount(0);
  });
});

test.describe('แจ้งเตือน / โปรไฟล์ (N)', () => {
  test('N-01 mock เพิ่มแจ้งเตือนใหม่ -> ภายใน 60 วินาที ตัวเลขบนกระดิ่งเพิ่มขึ้น', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    const count = page.locator('.bell-count');
    await expect(count).toHaveText('1');
    await page.evaluate(() => window.__mock.addNotification(2));
    await page.clock.fastForward(61_000);
    await expect(count).toHaveText('2');
  });

  test('N-02 กดอ่านแจ้งเตือน / อ่านทั้งหมด -> ตัวเลขลดลงถูกต้อง', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.evaluate(() => window.__mock.addNotification(2, { title: 'แจ้งเตือนทดสอบ' }));
    await page.goto('notifications.html');
    await expect(page.locator('.bell-count')).toHaveText('2');
    const unread = page.locator('[data-read="false"]');
    await expect(unread).toHaveCount(2);

    await page.getByRole('checkbox').check();
    await expect(page.locator('[data-read="true"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'อ่านทั้งหมด' }).click();
    await expect(page.locator('.toast')).toContainText('ทำเครื่องหมายอ่านแล้ว 2 รายการ');
    await expect(page.locator('.bell-count')).toBeHidden();
    await expect(page.getByText('ไม่มีแจ้งเตือนที่ยังไม่อ่าน')).toBeVisible();
  });

  test('คลิกแจ้งเตือนทีละรายการ -> อ่านแล้ว ตัวเลขลด แล้วไปหน้าที่เกี่ยวข้อง', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('notifications.html');
    await page.locator('[data-read="false"] button').first().click();
    await page.waitForURL(/member\/home\.html$/);
    await expect(page.locator('.bell-count')).toBeHidden();
  });

  test('แก้โปรไฟล์ได้เฉพาะชื่อ นามสกุล เบอร์ · อีเมลอ่านอย่างเดียว', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('profile.html');
    await expect(page.getByText('member@example.com')).toBeVisible();
    await expect(page.getByLabel('อีเมล')).toHaveCount(0);

    await page.getByLabel('เบอร์โทร').fill('081234567');
    await page.getByRole('button', { name: 'บันทึกข้อมูล' }).click();
    await expect(page.locator('#f-phone-err')).toContainText('10 หลัก');

    await page.getByLabel('นามสกุล').fill('ใจดีมาก');
    await page.getByLabel('เบอร์โทร').fill('0899999999');
    await page.getByRole('button', { name: 'บันทึกข้อมูล' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกข้อมูลแล้ว');
    await page.reload();
    await expect(page.getByLabel('นามสกุล')).toHaveValue('ใจดีมาก');
  });

  test('เปลี่ยนรหัสผ่าน: รหัสเดิมผิดแสดงใต้ช่อง, สำเร็จแล้ว login ด้วยรหัสใหม่ได้', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('profile.html');
    await page.getByLabel('รหัสผ่านปัจจุบัน').fill('wrong-pass1');
    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill('NewPassw0rd');
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill('NewPassw0rd');
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    await expect(page.locator('#f-currentPassword-err')).toHaveText('รหัสผ่านปัจจุบันไม่ถูกต้อง');

    await page.getByLabel('รหัสผ่านปัจจุบัน').fill('Passw0rd');
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    await expect(page.locator('.toast')).toContainText('เปลี่ยนรหัสผ่านแล้ว');
  });

  test('ประวัติการยืม: กรองตามสถานะ แบ่งหน้า และเก็บ filter ใน query string', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/history.html');
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await page.getByLabel('สถานะ').selectOption('cancelled');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    expect(page.url()).toContain('status=cancelled');
    await page.reload();
    await expect(page.getByLabel('สถานะ')).toHaveValue('cancelled');
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('ค้นหาเครื่อง: keyword + filter สถานะ เก็บใน query string', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebooks.html');
    await page.getByLabel('สถานะ').selectOption('damaged');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody')).toContainText('เสียหาย');
    expect(page.url()).toContain('currentStatus=damaged');

    await page.getByRole('button', { name: 'ล้างตัวกรอง' }).click();
    await page.getByLabel(/ค้นหา \(/).fill('zzz-ไม่มี');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.getByText('ไม่พบเครื่องที่ตรงกับเงื่อนไข')).toBeVisible();
  });

  test('P-01 สมาชิกเปิด admin/users.html ตรงๆ -> redirect ไป member/home.html', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('admin/users.html');
    await page.waitForURL(/member\/home\.html$/);
  });

  test('P-05 ยังไม่ login เปิด member/home.html -> ไปหน้า login พร้อม next', async ({ page }) => {
    await page.goto('member/home.html');
    await page.waitForURL(/login\.html\?next=/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/member/home.html');
  });

  test('X-01 ชื่อผู้ใช้มี <script> แสดงเป็นข้อความ ไม่ถูกรัน', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await editDb(page, (db) => { db.users.find((u) => u.id === 2).firstName = '<script>window.__xss=1</script>'; });
    await page.goto('profile.html');
    await expect(page.getByLabel('ชื่อ', { exact: true })).toHaveValue('<script>window.__xss=1</script>');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('ออกจากระบบ -> ลบ session และกลับไปหน้า login', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await page.waitForURL(/login\.html$/);
    expect(await page.evaluate(() => localStorage.getItem('nl.session'))).toBeNull();
  });
});
