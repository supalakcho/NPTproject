import { expect } from '@playwright/test';

// เวลาตั้งต้นของทุก test (ตรงกับตัวอย่างใน prompt) ใช้ page.clock ควบคุม ผลจึงไม่ขึ้นกับเวลาที่รัน
export const T0 = new Date('2026-10-08T16:30:00+07:00');
export const MIN = 60_000;
export const HOUR = 60 * MIN;

/** ติดตั้งนาฬิกาจำลองแล้ว login ด้วยบัญชี mock; คืนเมื่อถึงหน้าแรกของ role แล้ว */
export async function loginAs(page, email, { reset = true } = {}) {
  await page.clock.install({ time: T0 });
  await page.goto(`login.html${reset ? '?mockReset=1' : ''}`);
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill('Passw0rd');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.waitForURL(/(member\/home|admin\/returns)\.html$/);
  await expect(page.locator('#main h1').first()).toBeVisible();
}

/** แก้ข้อมูลใน mock db โดยตรง (ใช้จัดฉากเฉพาะ test) */
export async function editDb(page, fn, arg) {
  await page.evaluate(([src, a]) => {
    const db = window.__mock.getDb();
    // eslint-disable-next-line no-new-func
    new Function('db', 'arg', src)(db, a);
    window.__mock.setDb(db);
  }, [`(${fn.toString()})(db, arg)`, arg]);
}

/** กรอกช่อง datetime-local ด้วยเวลาไทย (YYYY-MM-DDTHH:mm) */
export async function setDateTime(locator, value) {
  await locator.fill(value);
}

export const toLocalInput = (ms) => new Date(ms + 7 * HOUR).toISOString().slice(0, 16);
