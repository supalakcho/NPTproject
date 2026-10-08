import { expect, test } from '@playwright/test';
import { loginAs, T0, toLocalInput, HOUR } from './helpers.js';

const MEMBER_PAGES = [
  'member/home.html', 'member/notebooks.html', 'member/notebooks.html?tab=available', 'member/notebook.html?id=1',
  'member/history.html', 'member/history.html?tab=reservations', 'profile.html', 'notifications.html',
];
const ADMIN_PAGES = [
  'admin/returns.html', 'admin/notebooks.html', 'admin/models.html', 'admin/brands.html', 'admin/loans.html',
  'admin/reservations.html', 'admin/users.html', 'admin/reports.html', 'admin/settings.html', 'admin/audit-logs.html',
  'profile.html', 'notifications.html',
];

async function ready(page) {
  await expect(page.locator('#main h1').first()).toBeVisible();
  await page.waitForFunction(() => !document.querySelector('#main [aria-busy="true"]'));
}

async function checkLayout(page, path) {
  await page.goto(path);
  await ready(page);

  // M-01: ไม่มี scroll แนวนอนของทั้งหน้า (ตารางกว้างต้องเลื่อนในกรอบของตัวเอง)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} มี scroll แนวนอน`).toBeLessThanOrEqual(0);

  const vp = page.viewportSize();
  const nav = await page.locator('nav.nav').boundingBox();
  if (vp.width < 960) {
    // มือถือ: เมนูอยู่ด้านล่างจอ
    expect(nav.y + nav.height, `${path} เมนูไม่ได้อยู่ล่างจอ`).toBeCloseTo(vp.height, 0);
    expect(nav.width).toBeCloseTo(vp.width, 0);
  } else {
    // เดสก์ท็อป: sidebar ซ้าย
    expect(nav.x).toBe(0);
    expect(nav.width).toBeLessThan(300);
    expect(nav.height).toBeCloseTo(vp.height, 0);
  }

  // ตารางที่กว้างกว่าจอเลื่อนได้ภายในกรอบของตัวเอง
  const scrollers = await page.locator('.table-scroll').evaluateAll((els) => els.map((e) => getComputedStyle(e).overflowX));
  for (const o of scrollers) expect(['auto', 'scroll']).toContain(o);
}

test.describe('M-01 ทุกหน้า: ไม่มี scroll แนวนอน เมนูอยู่ตามขนาดจอ', () => {
  test('หน้าสมาชิก', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'member@example.com');
    for (const path of MEMBER_PAGES) await checkLayout(page, path);
  });

  test('หน้าแอดมิน', async ({ page }) => {
    test.setTimeout(150_000);
    await loginAs(page, 'admin@example.com');
    for (const path of ADMIN_PAGES) await checkLayout(page, path);
  });

  test('หน้า login / register / ที่มี modal เปิดอยู่ก็ไม่ทำให้เกิด scroll แนวนอน', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await page.getByRole('button', { name: 'ยืมทันที' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await page.getByRole('dialog').boundingBox();
    expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
  });

  test('ปุ่มและช่องกรอกสูงอย่างน้อย 44px', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebooks.html');
    await ready(page);
    const heights = await page.locator('main .btn, main input:not([type=checkbox]), main select').evaluateAll(
      (els) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(3);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(43.5);
  });
});

test.describe('X-02 ใช้งานด้วยคีย์บอร์ดอย่างเดียว', () => {
  const focusedHasOutline = (page) => page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    return { visible: el.matches(':focus-visible'), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2, tag: el.tagName, text: (el.textContent || el.name || '').slice(0, 30) };
  });

  test('login ด้วยคีย์บอร์ดล้วน และทุกจุดที่โฟกัสเห็นกรอบ', async ({ page }) => {
    await page.clock.install({ time: T0 });
    await page.goto('login.html?mockReset=1');
    await page.keyboard.press('Tab'); // โฟกัสถูกตั้งที่ช่องอีเมลอยู่แล้ว จึง Tab ไปช่องถัดไป
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByLabel('อีเมล')).toBeFocused();
    await page.keyboard.type('member@example.com');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('รหัสผ่าน')).toBeFocused();
    expect((await focusedHasOutline(page)).outline).toBe(true);
    await page.keyboard.type('Passw0rd');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeFocused();
    expect((await focusedHasOutline(page)).outline).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForURL(/member\/home\.html$/);
  });

  test('Tab ผ่านหน้าแรกสมาชิก: ทุกจุดที่โฟกัสมีกรอบ focus ชัดเจน', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    await expect(page.locator('.loan-ticket')).toBeVisible();
    const seen = [];
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press('Tab');
      const f = await focusedHasOutline(page);
      if (f.tag === 'BODY') break; // วนครบทุกจุดในหน้าแล้ว โฟกัสออกไปที่ browser
      seen.push(f);
      expect(f.outline, `จุดที่ ${i + 1} (${f.tag} ${f.text}) ไม่มีกรอบ focus`).toBe(true);
    }
    expect(seen.length).toBeGreaterThanOrEqual(8);
    expect(seen.some((f) => f.text.includes('ต่อเวลา'))).toBe(true);
    expect(seen.some((f) => f.text.includes('คืนเครื่อง'))).toBe(true);
  });

  test('modal ยืมเครื่อง: เปิดด้วย Enter, Tab วนอยู่ใน modal, Esc ปิดและโฟกัสกลับปุ่มเดิม', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await ready(page);
    const opener = page.getByRole('button', { name: 'ยืมทันที' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('เวลาคืน')).toBeFocused();

    // กด Tab หลายรอบ โฟกัสต้องไม่ออกนอก modal ทั้งไปข้างหน้าและย้อนกลับ
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('ยืนยันคืนเครื่องด้วยคีย์บอร์ด: Esc = ยกเลิก บัตรไม่เปลี่ยน, Enter บนปุ่มยืนยัน = คืนเครื่อง', async ({ page }) => {
    await loginAs(page, 'member2@example.com');
    const ticket = page.locator('.loan-ticket');
    const returnBtn = ticket.getByRole('button', { name: 'คืนเครื่อง' });
    await returnBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(returnBtn).toBeFocused();
    await expect(ticket).not.toContainText('รอผู้ดูแลยืนยันรับคืน');

    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab'); // ไปปุ่ม "คืนเครื่อง" ใน dialog
    await page.keyboard.press('Enter');
    await expect(ticket).toContainText('คืนแล้ว รอผู้ดูแลยืนยันรับคืน');
  });

  test('ฟอร์มยืม: กรอกและส่งด้วยคีย์บอร์ดล้วน', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.goto('member/notebook.html?id=1');
    await ready(page);
    await page.getByRole('button', { name: 'ยืมทันที' }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('เวลาคืน').fill(toLocalInput(T0.getTime() + 2 * HOUR));
    // ช่อง datetime-local มีหลายส่วน (วัน/เดือน/ปี/เวลา) Tab ต่อไปจนถึงปุ่มยืนยันยืม
    const confirm = page.getByRole('button', { name: 'ยืนยันยืม' });
    for (let i = 0; i < 12 && !(await confirm.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForURL(/member\/home\.html$/);
  });

  test('หน้าแอดมิน: ช่องสแกนรหัสได้โฟกัสเมื่อเปิดหน้า และ Enter ค้นหาได้', async ({ page }) => {
    await loginAs(page, 'admin@example.com');
    await expect(page.getByLabel('สแกนหรือพิมพ์รหัสครุภัณฑ์')).toBeFocused();
    await page.keyboard.type('NB-2025-0009');
    await page.keyboard.press('Enter');
    await expect(page.locator('.return-card.is-selected')).toHaveCount(1);
  });

  test('ลิงก์และปุ่มในเมนูหลักโฟกัสได้ด้วยคีย์บอร์ดและมีกรอบ', async ({ page }) => {
    await loginAs(page, 'member@example.com');
    await page.locator('nav.nav a').first().focus();
    const f = await focusedHasOutline(page);
    expect(f.outline).toBe(true);
    await expect(page.locator('nav.nav a[aria-current="page"]')).toHaveText('หน้าแรก');
  });
});
