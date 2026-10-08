import { expect, test } from '@playwright/test';

const fillLogin = async (page, email, password = 'Passw0rd') => {
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
};

test.describe('หน้า login / register (รอบ 1)', () => {
  test('แสดงแถบโหมดทดสอบ และไม่มีลิงก์ลืมรหัสผ่าน', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await expect(page.getByText('โหมดทดสอบ (ข้อมูลจำลอง)')).toBeVisible();
    await expect(page.getByText('ลืมรหัสผ่าน')).toHaveCount(0);
  });

  test('member login สำเร็จ -> ไป member/home.html และเก็บ session', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await fillLogin(page, 'member@example.com');
    await page.waitForURL(/member\/home\.html$/);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('nl.session')));
    expect(session.user.roleCode).toBe('member');
    expect(session.permissions).toContain('loan.create');
  });

  test('admin login -> ไป admin/returns.html', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await fillLogin(page, 'admin@example.com');
    await page.waitForURL(/admin\/returns\.html$/);
  });

  test('รหัสผ่านผิด -> แสดงข้อความ INVALID_CREDENTIALS จาก backend ค้างในฟอร์ม', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await fillLogin(page, 'member@example.com', 'wrongpass1');
    await expect(page.locator('.form-error')).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    await expect(page).toHaveURL(/login\.html/);
  });

  test('P-03 บัญชีถูกระงับ -> แสดงข้อความ ACCOUNT_SUSPENDED', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await fillLogin(page, 'suspended@example.com');
    await expect(page.locator('.form-error')).toContainText('บัญชีนี้ถูกระงับ');
    expect(await page.evaluate(() => localStorage.getItem('nl.session'))).toBeNull();
  });

  test('ไม่กรอกอะไรเลย -> error ใต้ช่อง ไม่ส่ง request และโฟกัสช่องแรก', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    let requests = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/')) requests += 1; });
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(page.locator('#f-email-err')).toHaveText('กรุณากรอกอีเมล');
    await expect(page.getByLabel('อีเมล')).toBeFocused();
    expect(requests).toBe(0);
  });

  test('P-04 next เป็น URL ภายนอก -> ไปหน้าแรกตาม role ไม่ไปลิงก์ภายนอก', async ({ page }) => {
    await page.goto('login.html?mockReset=1&next=https://evil.example/');
    await fillLogin(page, 'member@example.com');
    await page.waitForURL(/member\/home\.html$/);
    expect(new URL(page.url()).hostname).toBe('localhost');
  });

  test('P-04 next เป็น //evil.example -> ไม่ไปลิงก์ภายนอก', async ({ page }) => {
    await page.goto('login.html?mockReset=1&next=//evil.example/x');
    await fillLogin(page, 'member@example.com');
    await page.waitForURL(/member\/home\.html$/);
  });

  test('next ภายในแอป -> กลับไปหน้านั้นหลัง login (P-02)', async ({ page }) => {
    await page.goto('login.html?mockReset=1&next=/member/history.html%3Fstatus%3Dreturned');
    await fillLogin(page, 'member@example.com');
    await page.waitForURL(/member\/history\.html\?status=returned$/);
  });

  test('P-05 ยังไม่ login เปิด index.html -> ไปหน้า login พร้อม next', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await page.goto('index.html');
    await page.waitForURL(/login\.html\?next=/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/index.html');
  });

  test('P-02 session หมดอายุ -> index.html พาไปหน้า login', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await page.evaluate(() => localStorage.setItem('nl.session', JSON.stringify({
      token: 'x', expiresAt: '2020-01-01T00:00:00+07:00', user: { roleCode: 'member' }, permissions: [],
    })));
    await page.goto('index.html');
    await page.waitForURL(/login\.html/);
    expect(await page.evaluate(() => localStorage.getItem('nl.session'))).toBeNull();
  });

  test('index.html หลัง login -> ยืนยัน token ด้วย GET /me แล้วไปหน้าแรกตาม role', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await fillLogin(page, 'admin@example.com');
    await page.waitForURL(/admin\/returns\.html$/);
    await page.goto('index.html');
    await page.waitForURL(/admin\/returns\.html$/);
  });

  test('D-01 ?mockReset=1 ล้างข้อมูล mock กลับเป็นค่าตั้งต้น', async ({ page }) => {
    await page.goto('login.html?mockReset=1');
    await page.evaluate(() => { const db = window.__mock.getDb(); db.users = []; window.__mock.setDb(db); });
    await page.goto('login.html');
    await fillLogin(page, 'member@example.com');
    await expect(page.locator('.form-error')).toBeVisible(); // ไม่มีผู้ใช้เหลือแล้ว

    await page.goto('login.html?mockReset=1');
    await fillLogin(page, 'member@example.com');
    await page.waitForURL(/member\/home\.html$/);
  });
});

test.describe('สมัครสมาชิก', () => {
  const fill = async (page, v) => {
    for (const [label, value] of Object.entries(v)) await page.getByLabel(label, { exact: true }).fill(value);
  };
  const good = {
    อีเมล: 'new@example.com', รหัสผ่าน: 'Passw0rd', ชื่อ: 'ใหม่', นามสกุล: 'ทดสอบ', เบอร์โทร: '0812345678',
  };

  test('สมัครสำเร็จ ใช้ token ที่ได้เข้าใช้งานทันที', async ({ page }) => {
    await page.goto('register.html?mockReset=1');
    await fill(page, good);
    await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
    await page.waitForURL(/member\/home\.html$/);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('nl.session')));
    expect(session.user.email).toBe('new@example.com');
  });

  test('V-07 รหัสผ่านไม่มีตัวเลข + เบอร์ 9 หลัก -> error ตรงช่อง ไม่ส่ง request', async ({ page }) => {
    await page.goto('register.html?mockReset=1');
    let requests = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/')) requests += 1; });
    await fill(page, { ...good, รหัสผ่าน: 'abcdefgh', เบอร์โทร: '081234567' });
    await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
    await expect(page.locator('#f-password-err')).toContainText('ตัวเลข');
    await expect(page.locator('#f-phone-err')).toContainText('10 หลัก');
    await expect(page.locator('#f-email-err')).toHaveText('');
    expect(requests).toBe(0);
  });

  test('EMAIL_TAKEN แสดงใต้ช่องอีเมล, MEMBER_CODE_TAKEN ใต้ช่องรหัสสมาชิก', async ({ page }) => {
    await page.goto('register.html?mockReset=1');
    await fill(page, { ...good, อีเมล: 'member@example.com' });
    await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
    await expect(page.locator('#f-email-err')).toHaveText('อีเมลนี้ถูกใช้แล้ว');
    await expect(page.getByLabel('อีเมล', { exact: true })).toBeFocused();

    await fill(page, { อีเมล: 'other@example.com', 'รหัสสมาชิก (ไม่บังคับ)': '6501234' });
    await page.getByRole('button', { name: 'สมัครสมาชิก' }).click();
    await expect(page.locator('#f-memberCode-err')).toHaveText('รหัสสมาชิกนี้ถูกใช้แล้ว');
  });

  test('กดสมัครซ้ำเร็วๆ ส่ง request ครั้งเดียว (B-06 แบบเดียวกัน)', async ({ page }) => {
    await page.goto('register.html?mockReset=1');
    await fill(page, good);
    const button = page.getByRole('button', { name: 'สมัครสมาชิก' });
    await button.dblclick();
    await page.waitForURL(/member\/home\.html$/);
    const users = await page.evaluate(() => JSON.parse(localStorage.getItem('nl.mockDb')).users.filter((u) => u.email === 'new@example.com').length);
    expect(users).toBe(1);
  });
});

test.describe('layout ที่ 375px (ส่วนหนึ่งของ M-01)', () => {
  for (const path of ['login.html', 'register.html']) {
    test(`${path} ไม่มี scroll แนวนอน`, async ({ page }) => {
      await page.goto(`${path}?mockReset=1`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
