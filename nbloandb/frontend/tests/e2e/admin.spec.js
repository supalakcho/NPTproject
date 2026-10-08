import { expect, test } from '@playwright/test';
import { editDb, HOUR, loginAs, MIN, T0, toLocalInput } from './helpers.js';

const t0 = T0.getTime();
const card = (page, id) => page.locator(`.return-card[data-loan-id="${id}"]`);
const dialog = (page) => page.getByRole('dialog');

test.describe('รับคืน (A-01…A-04, V-09)', () => {
  test('หน้าแรกแอดมินคือคิวรอยืนยันรับคืน 3 รายการ มี 1 รายการคืนช้า', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await expect(page.getByRole('heading', { name: 'รอยืนยันรับคืน' })).toBeVisible();
    await expect(page.getByText('รอรับคืน 3 เครื่อง')).toBeVisible();
    await expect(page.locator('.return-card')).toHaveCount(3);
    await expect(page.locator('.return-card .badge', { hasText: 'คืนช้า' })).toHaveCount(1);
    await expect(card(page, 4)).toContainText('คืนช้า 30 นาที');
  });

  test('A-01 สแกนรหัสเครื่องที่รอรับคืน -> รายการนั้นถูกเลือกและเลื่อนมาให้เห็น', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.getByLabel('สแกนหรือพิมพ์รหัสครุภัณฑ์').fill('NB-2025-0010');
    await page.keyboard.press('Enter');
    await expect(card(page, 4)).toHaveClass(/is-selected/);
    await expect(card(page, 4)).toBeInViewport();
    await expect(card(page, 3)).not.toHaveClass(/is-selected/);
  });

  test('A-02 สแกนรหัสที่ไม่มีในระบบ -> แสดงข้อความ NOTEBOOK_NOT_FOUND', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.getByLabel('สแกนหรือพิมพ์รหัสครุภัณฑ์').fill('NB-9999-0000');
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast-error')).toHaveText('ไม่พบโน๊ตบุ๊ค');
  });

  test('V-09 เสียหายไม่กรอกหมายเหตุ -> ปุ่มยืนยันกดไม่ได้ จนกว่าจะเลือกสภาพและกรอกหมายเหตุ', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    const c = card(page, 3);
    const confirm = c.getByRole('button', { name: 'ยืนยันรับคืน' });
    await expect(confirm).toBeDisabled(); // ยังไม่เลือกสภาพ
    await c.getByLabel('เสียหาย', { exact: true }).check();
    await expect(confirm).toBeDisabled(); // เสียหายแต่ไม่มีหมายเหตุ
    await c.getByLabel(/หมายเหตุ/).fill('จอแตก');
    await expect(confirm).toBeEnabled();
    await c.getByLabel('ปกติ', { exact: true }).check();
    await expect(confirm).toBeEnabled();
  });

  test('ยืนยันรับคืนสภาพปกติ -> รายการออกจากคิว และสมาชิกเห็นเป็น "คืนแล้ว"', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await card(page, 3).getByLabel('ปกติ', { exact: true }).check();
    await card(page, 3).getByRole('button', { name: 'ยืนยันรับคืน' }).click();
    await expect(page.locator('.toast')).toContainText('รับคืนเครื่อง NB-2025-0009 แล้ว');
    await expect(page.locator('.return-card')).toHaveCount(2);
    await expect(page.getByText('รอรับคืน 2 เครื่อง')).toBeVisible();
  });

  test('A-03 รับคืนแบบเสียหาย มีการจองในอนาคต -> ถามว่ายกเลิกไหม ตกลงแล้วการจองเป็น "ยกเลิก"', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await editDb(page, (db, now) => {
      db.reservations.push({
        id: 91, userId: 2, notebookId: 10, startAt: now + 48 * 3600000, endAt: now + 51 * 3600000, pickupDeadline: now + 48.5 * 3600000,
        status: 'upcoming', loanId: null, cancelledAt: null, cancelReason: null, createdAt: now,
      });
    }, t0);
    const c = card(page, 4);
    await c.getByLabel('เสียหาย', { exact: true }).check();
    await c.getByLabel(/หมายเหตุ/).fill('จอแตกมุมขวา');
    await c.getByRole('button', { name: 'ยืนยันรับคืน' }).click();

    await expect(dialog(page)).toContainText('ยกเลิกการจองที่ได้รับผลกระทบ?');
    await expect(dialog(page)).toContainText('สมชาย ใจดี');
    await dialog(page).getByRole('button', { name: 'ยกเลิกการจองเหล่านี้' }).click();
    await expect(page.locator('.toast', { hasText: 'ยกเลิกการจองแล้ว 1 รายการ' })).toBeVisible();

    const res = await page.evaluate(() => window.__mock.getDb().reservations.find((r) => r.id === 91));
    expect(res.status).toBe('cancelled');
    expect(res.cancelReason).toBe('เครื่องไม่พร้อมให้ใช้งาน');
    const nb = await page.evaluate(() => window.__mock.getDb().notebooks.find((n) => n.id === 10));
    expect(nb.conditionStatus).toBe('damaged');
  });

  test('A-03 ตอบ "ไม่ยกเลิก" -> การจองยังอยู่', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await editDb(page, (db, now) => {
      db.reservations.push({
        id: 91, userId: 2, notebookId: 10, startAt: now + 48 * 3600000, endAt: now + 51 * 3600000, pickupDeadline: now + 48.5 * 3600000,
        status: 'upcoming', loanId: null, cancelledAt: null, cancelReason: null, createdAt: now,
      });
    }, t0);
    const c = card(page, 4);
    await c.getByLabel('เสียหาย', { exact: true }).check();
    await c.getByLabel(/หมายเหตุ/).fill('จอแตก');
    await c.getByRole('button', { name: 'ยืนยันรับคืน' }).click();
    await dialog(page).getByRole('button', { name: 'ไม่ยกเลิก' }).click();
    await expect(page.locator('.return-card')).toHaveCount(2);
    const res = await page.evaluate(() => window.__mock.getDb().reservations.find((r) => r.id === 91));
    expect(res.status).toBe('upcoming');
  });

  test('A-04 บันทึกรับคืนเครื่องที่สมาชิกยังไม่กดคืน พร้อมระบุเวลา -> "คืนแล้ว" และคำนวณคืนช้าตามเวลาที่ระบุ', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.getByRole('button', { name: 'บันทึกรับคืนเครื่องที่ยังไม่กดคืน' }).click();
    await dialog(page).getByLabel('รหัสครุภัณฑ์ของเครื่องที่นำมาคืน').fill('NB-2025-0008');
    await page.keyboard.press('Enter');

    await expect(dialog(page)).toContainText('บันทึกรับคืน NB-2025-0008');
    await dialog(page).getByLabel('ปกติ', { exact: true }).check();
    // กำหนดคืน = 16:05 ระบุว่าเครื่องมาถึง 16:20 (หลังกำหนด) -> ต้องเป็นคืนช้า
    await dialog(page).getByLabel(/เวลาที่เครื่องมาถึงจริง/).fill(toLocalInput(t0 - 10 * MIN));
    await dialog(page).getByRole('button', { name: 'ยืนยันรับคืน' }).click();
    await expect(page.locator('.toast')).toContainText('รับคืนเครื่อง NB-2025-0008 แล้ว');

    await page.goto('admin/loans.html?status=returned');
    const row = page.locator('tbody tr', { hasText: 'NB-2025-0008' });
    await expect(row).toContainText('คืนแล้ว');
    await expect(row).toContainText('คืนช้า');
  });

  test('A-04 ระบุเวลาก่อนกำหนดคืน -> คืนแล้วและไม่คืนช้า', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.getByLabel('สแกนหรือพิมพ์รหัสครุภัณฑ์').fill('NB-2025-0008');
    await page.keyboard.press('Enter');
    await dialog(page).getByLabel('ปกติ', { exact: true }).check();
    await dialog(page).getByLabel(/เวลาที่เครื่องมาถึงจริง/).fill(toLocalInput(t0 - 40 * MIN));
    await dialog(page).getByRole('button', { name: 'ยืนยันรับคืน' }).click();
    await expect(page.locator('.toast')).toContainText('รับคืนเครื่อง NB-2025-0008 แล้ว');
    await page.goto('admin/loans.html?status=returned');
    await expect(page.locator('tbody tr', { hasText: 'NB-2025-0008' })).not.toContainText('คืนช้า');
  });

  test('เวลาที่ระบุในอนาคต -> error ใต้ช่อง ไม่ส่ง request', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.getByLabel('สแกนหรือพิมพ์รหัสครุภัณฑ์').fill('NB-2025-0008');
    await page.keyboard.press('Enter');
    await dialog(page).getByLabel('ปกติ', { exact: true }).check();
    await dialog(page).getByLabel(/เวลาที่เครื่องมาถึงจริง/).fill(toLocalInput(t0 + 3 * HOUR));
    // เวลาในอนาคตไม่ผ่านการตรวจ ปุ่มยืนยันจึงกดไม่ได้
    await expect(dialog(page).getByRole('button', { name: 'ยืนยันรับคืน' })).toBeDisabled();
    await dialog(page).getByLabel(/เวลาที่เครื่องมาถึงจริง/).fill(toLocalInput(t0 - 10 * MIN));
    await expect(dialog(page).getByRole('button', { name: 'ยืนยันรับคืน' })).toBeEnabled();
  });

  test('สแกนเครื่องที่ไม่มีรายการยืมค้าง -> แจ้งข้อความ', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.getByLabel('สแกนหรือพิมพ์รหัสครุภัณฑ์').fill('NB-2025-0001');
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast')).toContainText('ไม่มีรายการยืมค้างอยู่');
  });

  test('X-01 ชื่อผู้ใช้มี <script> แสดงเป็นข้อความ ไม่ถูกรัน', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await expect(card(page, 3)).toContainText('<script>alert("xss")</script>');
    expect(await page.locator('.return-card script').count()).toBe(0);
  });
});

test.describe('จัดการข้อมูล (A-05…A-08)', () => {
  test('A-05 ลบเครื่องที่มีการจองในอนาคต -> NOTEBOOK_HAS_COMMITMENTS พร้อมจำนวน', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/notebooks.html');
    const row = page.locator('tbody tr', { hasText: 'NB-2025-0002' });
    await row.getByRole('button', { name: 'ลบ', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'ลบเครื่อง' }).click();
    const toast = page.locator('.toast-error');
    await expect(toast).toContainText('เครื่องนี้มีการยืมหรือการจองค้างอยู่');
    await expect(toast).toContainText('การจองล่วงหน้า 1 รายการ');
    await expect(row).toBeVisible();
  });

  test('ลบเครื่องที่ไม่มีภาระ -> หายจากรายการ และกู้คืนได้เมื่อเปิดแสดงที่ลบแล้ว', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/notebooks.html');
    await page.locator('tbody tr', { hasText: 'NB-2025-0013' }).getByRole('button', { name: 'ลบ', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'ลบเครื่อง' }).click();
    await expect(page.locator('.toast')).toContainText('ลบเครื่องแล้ว');
    await expect(page.locator('tbody tr', { hasText: 'NB-2025-0013' })).toHaveCount(0);

    await page.getByLabel('แสดงที่ลบแล้ว').check();
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    const row = page.locator('tbody tr', { hasText: 'NB-2025-0013' });
    await expect(row).toContainText('ลบแล้ว');
    await row.getByRole('button', { name: 'กู้คืน' }).click();
    await expect(page.locator('.toast', { hasText: 'กู้คืนเครื่องแล้ว' })).toBeVisible();
  });

  test('เพิ่มเครื่องใหม่: รหัสซ้ำแสดงใต้ช่อง, ไม่ซ้ำเพิ่มสำเร็จ', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/notebooks.html');
    await page.getByRole('button', { name: 'เพิ่มเครื่อง' }).click();
    await dialog(page).getByLabel('รุ่น').selectOption({ index: 1 });
    await dialog(page).getByLabel('รหัสครุภัณฑ์').fill('NB-2025-0001');
    await dialog(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(dialog(page).locator('[data-error-for="assetCode"]')).toHaveText('รหัสครุภัณฑ์นี้ถูกใช้แล้ว');

    await dialog(page).getByLabel('รหัสครุภัณฑ์').fill('NB-2026-0100');
    await dialog(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('เพิ่มเครื่องแล้ว');
    await page.getByLabel(/ค้นหา \(/).fill('NB-2026-0100');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('แก้สภาพเครื่องเป็นซ่อมบำรุงขณะมีการจอง -> ถามยกเลิกการจอง (N6)', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/notebooks.html');
    await page.locator('tbody tr', { hasText: 'NB-2025-0002' }).getByRole('button', { name: 'แก้ไข' }).click();
    await dialog(page).getByLabel('สภาพเครื่อง', { exact: true }).selectOption('maintenance');
    await dialog(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(dialog(page)).toContainText('ยกเลิกการจองที่ได้รับผลกระทบ?');
    await expect(dialog(page)).toContainText('สมหญิง รักเรียน');
  });

  test('A-06 ยกเลิกรายการยืมโดยไม่กรอกเหตุผล -> ปุ่มยืนยันกดไม่ได้ กรอกแล้วสถานะเป็น "ยกเลิก"', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/loans.html');
    const row = page.locator('tbody tr', { hasText: 'NB-2025-0003' });
    await row.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    const confirm = dialog(page).getByRole('button', { name: 'ยกเลิกรายการยืม' });
    await expect(confirm).toBeDisabled();
    await dialog(page).getByLabel('เหตุผลที่ยกเลิก').fill('บันทึกผิดเครื่อง');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.locator('.toast')).toContainText('ยกเลิกรายการยืมแล้ว');
    await expect(row).toContainText('ยกเลิก');
    await expect(row.getByRole('button', { name: 'ยกเลิก', exact: true })).toHaveCount(0);
  });

  test('รายการยืม: filter คืนช้า และดูรายละเอียด', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/loans.html');
    await page.getByLabel('การคืนช้า').selectOption('true');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    expect(page.url()).toContain('isLate=true');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText('คืนช้า');
    await rows.first().getByRole('button', { name: 'รายละเอียด' }).click();
    await expect(dialog(page)).toContainText('กำหนดคืน');
  });

  test('รายการจอง: แอดมินยกเลิกต้องมีเหตุผล และผู้จองได้แจ้งเตือน', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/reservations.html?status=upcoming');
    const row = page.locator('tbody tr', { hasText: 'NB-2025-0002' });
    await row.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    const confirm = dialog(page).getByRole('button', { name: 'ยกเลิกการจอง' });
    await expect(confirm).toBeDisabled();
    await dialog(page).getByLabel('เหตุผลที่ยกเลิก').fill('เครื่องส่งซ่อม');
    await confirm.click();
    await expect(page.locator('.toast')).toContainText('ยกเลิกการจองแล้ว');
    const unread = await page.evaluate(() => window.__mock.getDb().notifications.filter((n) => n.userId === 3 && n.type === 'reservation_cancelled').length);
    expect(unread).toBe(1);
  });

  test('A-07 ระงับบัญชีตัวเอง -> แสดงข้อความ CANNOT_MODIFY_SELF', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/users.html');
    const row = page.locator('tbody tr', { hasText: 'admin@example.com' });
    await row.getByRole('button', { name: 'ระงับ' }).click();
    await dialog(page).getByRole('button', { name: 'ระงับบัญชี' }).click();
    await expect(page.locator('.toast-error')).toHaveText('ไม่สามารถทำรายการนี้กับบัญชีของตัวเองได้');
  });

  test('สมาชิก: ลบคนที่ยังมีเครื่องค้าง -> USER_HAS_ACTIVE_LOANS, รายละเอียดแสดง activeLoanCount', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/users.html');
    const row = page.locator('tbody tr', { hasText: 'member2@example.com' });
    await row.getByRole('button', { name: 'รายละเอียด' }).click();
    await expect(dialog(page)).toContainText('เครื่องที่ยืมค้างอยู่');
    await expect(dialog(page)).toContainText('1 เครื่อง');
    await dialog(page).getByRole('button', { name: 'ปิด' }).click();

    await row.getByRole('button', { name: 'ลบ', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'ลบสมาชิก' }).click();
    await expect(page.locator('.toast-error')).toContainText('ผู้ใช้นี้ยังมีเครื่องที่ยังไม่คืน');
  });

  test('สมาชิก: ระงับแล้วเปิดใช้งานได้, X-01 ชื่อมี <script> แสดงเป็นข้อความ', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/users.html');
    await expect(page.locator('tbody')).toContainText('<script>alert("xss")</script>');
    expect(await page.locator('tbody script').count()).toBe(0);

    const row = page.locator('tbody tr', { hasText: 'member3@example.com' });
    await row.getByRole('button', { name: 'ระงับ' }).click();
    await dialog(page).getByRole('button', { name: 'ระงับบัญชี' }).click();
    await expect(row).toContainText('ถูกระงับ');
    await row.getByRole('button', { name: 'เปิดใช้งาน' }).click();
    await expect(row).toContainText('ใช้งานอยู่');
  });

  test('สมาชิก: แก้ไขข้อมูล อีเมลซ้ำแสดงใต้ช่อง', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/users.html');
    await page.locator('tbody tr', { hasText: 'member3@example.com' }).getByRole('button', { name: 'แก้ไข' }).click();
    await dialog(page).getByLabel('อีเมล').fill('member@example.com');
    await dialog(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(dialog(page).locator('[data-error-for="email"]')).toHaveText('อีเมลนี้ถูกใช้แล้ว');
  });

  test('A-08 แก้ settings ค่าหนึ่งผิดช่วง -> ไม่บันทึกค่าใดเลย แสดง error ตรงช่อง', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/settings.html');
    await page.getByLabel('จองล่วงหน้าได้ไม่เกิน (วัน)').fill('10');
    await page.getByLabel('ระยะเวลายืมสูงสุด (ชั่วโมง)').fill('25');
    await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
    await expect(page.locator('[data-error-for="maxLoanHours"]')).toContainText('1–24');
    await expect(page.getByLabel('ระยะเวลายืมสูงสุด (ชั่วโมง)')).toBeFocused();
    const s = await page.evaluate(() => window.__mock.getDb().settings);
    expect(s.maxLoanHours).toBe(24);
    expect(s.reservationMaxDaysAhead).toBe(7); // ค่าที่ถูกต้องก็ไม่ถูกบันทึก
  });

  test('settings: บันทึกค่าถูกต้องทั้งหมดในครั้งเดียว และฟอร์มยืมใช้ค่าใหม่ทันที (V-08)', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/settings.html');
    await page.getByLabel('ระยะเวลายืมสูงสุด (ชั่วโมง)').fill('12');
    await page.getByLabel('จองล่วงหน้าได้ไม่เกิน (วัน)').fill('10');
    await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกการตั้งค่าแล้ว');
    const s = await page.evaluate(() => window.__mock.getDb().settings);
    expect([s.maxLoanHours, s.reservationMaxDaysAhead]).toEqual([12, 10]);
  });

  test('ยี่ห้อ: ชื่อซ้ำ, ลบที่ยังมีรุ่น (BRAND_IN_USE พร้อมจำนวน), ลบและกู้คืน', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/brands.html');
    await page.getByRole('button', { name: 'เพิ่มยี่ห้อ' }).click();
    await dialog(page).getByLabel('ชื่อยี่ห้อ').fill('lenovo');
    await dialog(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(dialog(page).locator('[data-error-for="name"]')).toHaveText('มียี่ห้อนี้อยู่แล้ว');
    await dialog(page).getByLabel('ชื่อยี่ห้อ').fill('Samsung');
    await dialog(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('เพิ่มยี่ห้อแล้ว');

    await page.locator('tbody tr', { hasText: 'Lenovo' }).getByRole('button', { name: 'ลบ', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'ลบยี่ห้อ' }).click();
    await expect(page.locator('.toast-error')).toContainText('มีรุ่นที่ใช้ยี่ห้อนี้ 2 รุ่น');

    const sam = page.locator('tbody tr', { hasText: 'Samsung' });
    await sam.getByRole('button', { name: 'ลบ', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'ลบยี่ห้อ' }).click();
    await expect(page.locator('tbody tr', { hasText: 'Samsung' })).toHaveCount(0);

    await page.getByLabel('แสดงที่ลบแล้ว').check();
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await page.locator('tbody tr', { hasText: 'Samsung' }).getByRole('button', { name: 'กู้คืน' }).click();
    await expect(page.locator('.toast', { hasText: 'กู้คืนยี่ห้อแล้ว' })).toBeVisible();
  });

  test('รุ่น: ตรวจช่วงค่า RAM/Storage/จอ ก่อนส่ง, เพิ่มสำเร็จ, ลบที่ยังมีเครื่อง (MODEL_IN_USE)', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/models.html');
    await page.getByRole('button', { name: 'เพิ่มรุ่น' }).click();
    const d = dialog(page);
    await d.getByLabel('ยี่ห้อ').selectOption({ label: 'Dell' });
    await d.getByLabel('ชื่อรุ่น').fill('Latitude 7440');
    await d.getByLabel('CPU').fill('Intel Core i7');
    await d.getByLabel('ระบบปฏิบัติการ').fill('Windows 11 Pro');
    await d.getByLabel('RAM (GB)').fill('257');
    await d.getByLabel('พื้นที่จัดเก็บ (GB)').fill('8193');
    await d.getByLabel('ขนาดจอ (นิ้ว)').fill('9.9');
    await d.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(d.locator('[data-error-for="ramGb"]')).toContainText('1–256');
    await expect(d.locator('[data-error-for="storageGb"]')).toContainText('1–8192');
    await expect(d.locator('[data-error-for="screenInch"]')).toContainText('10–18');

    await d.getByLabel('RAM (GB)').fill('32');
    await d.getByLabel('พื้นที่จัดเก็บ (GB)').fill('1024');
    await d.getByLabel('ขนาดจอ (นิ้ว)').fill('14');
    await d.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('เพิ่มรุ่นแล้ว');

    await page.locator('tbody tr', { hasText: 'ThinkPad E14 Gen 5' }).getByRole('button', { name: 'ลบ', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'ลบรุ่น' }).click();
    await expect(page.locator('.toast-error')).toContainText('มีเครื่องที่ใช้รุ่นนี้ 3 เครื่อง');
  });

  test('รุ่น: อัปโหลดรูปผิดชนิด -> error, ชนิดถูกต้อง -> สำเร็จ', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/models.html');
    await page.locator('tbody tr', { hasText: 'VivoBook 15' }).getByRole('button', { name: 'เปลี่ยนรูป' }).click();
    await dialog(page).locator('input[type="file"]').setInputFiles({ name: 'a.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await dialog(page).getByRole('button', { name: 'อัปโหลด' }).click();
    await expect(dialog(page).locator('[data-error-for="image"]')).toContainText('jpg, png หรือ webp');

    await dialog(page).locator('input[type="file"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await dialog(page).getByRole('button', { name: 'อัปโหลด' }).click();
    await expect(page.locator('.toast')).toContainText('อัปโหลดรูปแล้ว');
    await expect(page.locator('tbody tr', { hasText: 'VivoBook 15' }).locator('img')).toBeVisible();
  });
});

test.describe('รายงาน / Audit log', () => {
  test('รายงาน: สรุปสถานะเป็นตาราง และรายเดือนมีตาราง + กราฟ SVG', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/reports.html');
    const summary = page.getByRole('region', { name: 'ตารางสรุปสถานะเครื่อง' });
    await expect(summary).toContainText('เครื่องทั้งหมด');
    await expect(summary.locator('tr', { hasText: 'เครื่องทั้งหมด' })).toContainText('14');
    await expect(summary.locator('tr', { hasText: 'ว่าง' }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'ยืมค้าง' }).click();
    await expect(page.locator('.list-view tbody tr').first()).toContainText('เกินกำหนด'); // เกินกำหนดขึ้นก่อน

    await page.getByRole('tab', { name: 'รายเดือน' }).click();
    await expect(page.locator('svg.chart')).toBeVisible();
    await expect(page.locator('svg.chart rect')).toHaveCount(14); // 6 เดือน x 2 แท่ง + 2 สี่เหลี่ยมคำอธิบาย
    await expect(page.locator('svg.chart').getByText('คืนช้า', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'จำนวนการยืมรายเดือน' }).locator('tbody tr')).toHaveCount(6);
  });

  test('รายงานรายเดือน: ช่วงเกิน 24 เดือน -> error ไม่ส่ง request', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/reports.html');
    await page.getByRole('tab', { name: 'รายเดือน' }).click();
    await page.getByLabel('ตั้งแต่เดือน').fill('2024-01');
    await page.getByLabel('ถึงเดือน').fill('2026-10');
    await page.getByRole('button', { name: 'ดูรายงาน' }).click();
    await expect(page.locator('[data-error-for="toMonth"]')).toHaveText('เลือกช่วงได้ไม่เกิน 24 เดือน');
  });

  test('Audit log: ดูรายการ กรอง และเปิดรายละเอียดเทียบค่าก่อน/หลัง', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/audit-logs.html');
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await page.getByLabel('ตาราง (เช่น loans)').fill('notebooks');
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'รายละเอียด' }).click();
    await expect(dialog(page)).toContainText('conditionStatus');
    await expect(dialog(page).locator('.diff-old').first()).toContainText('normal');
    await expect(dialog(page).locator('.diff-new').first()).toContainText('damaged');
  });

  test('การกระทำของแอดมินถูกบันทึกลง audit log', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('admin/brands.html');
    await page.getByRole('button', { name: 'เพิ่มยี่ห้อ' }).click();
    await dialog(page).getByLabel('ชื่อยี่ห้อ').fill('Samsung');
    await dialog(page).getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('เพิ่มยี่ห้อแล้ว');
    await page.goto('admin/audit-logs.html');
    await expect(page.locator('tbody tr').first()).toContainText('CREATE');
    await expect(page.locator('tbody tr').first()).toContainText('brands');
  });
});

test.describe('สิทธิ์ (P)', () => {
  test('แอดมินเปิดหน้าสมาชิก -> redirect ไป admin/returns.html', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.goto('member/home.html');
    await page.waitForURL(/admin\/returns\.html$/);
  });

  test('เมนูแอดมินแสดงตาม permission: ซ่อนรายงานเมื่อไม่มี report.view', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await expect(page.locator('nav.nav').getByRole('link', { name: 'รายงาน' })).toBeVisible();
    await editDb(page, () => {});
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('nl.session'));
      s.permissions = s.permissions.filter((p) => p !== 'report.view');
      localStorage.setItem('nl.session', JSON.stringify(s));
      sessionStorage.setItem('nl.verifiedToken', s.token); // ไม่ให้ GET /me เขียนทับ permissions ในการทดสอบนี้
    });
    await page.reload();
    await expect(page.locator('nav.nav').getByRole('link', { name: 'รายงาน' })).toHaveCount(0);
  });

  test('ไม่มี permission ของหน้านั้น -> ไม่ให้เข้า', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('nl.session'));
      s.permissions = s.permissions.filter((p) => p !== 'report.view');
      localStorage.setItem('nl.session', JSON.stringify(s));
      sessionStorage.setItem('nl.verifiedToken', s.token);
    });
    await page.goto('admin/reports.html');
    await page.waitForURL(/admin\/returns\.html$/);
  });
});
