// ทดสอบ HTTP layer จริงผ่าน fetch: รูปแบบ response, status code, auth, ลำดับ route, upload และ flow หลัก
import { closePool, unique, createNotebook, insertLoan, HOUR } from '../helpers/serviceEnv.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)),
  });
  return { status: res.status, body: await res.json() };
}

async function registerMember() {
  const email = `${unique('http')}@test.local`;
  const res = await call('POST', '/auth/register', {
    body: { email, password: 'Passw0rd', firstName: 'เอพีไอ', lastName: 'ทดสอบ', phone: '0812345678' },
  });
  assert.equal(res.status, 201);
  return { token: res.body.data.token, user: res.body.data.user };
}

// ผู้ใช้จาก fixture มีรหัสผ่านปลอม จึง login ด้วยแอดมินจาก seed
async function loginAdmin() {
  const res = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'Admin@1234' } });
  assert.equal(res.status, 200);
  return res.body.data.token;
}

test('รูปแบบ error: ไม่มี token = 401, route ไม่มี = 404, JSON เสีย = 400 VALIDATION_ERROR (ไม่มี stack)', async () => {
  const noToken = await call('GET', '/me');
  assert.equal(noToken.status, 401);
  assert.deepEqual(noToken.body, { success: false, error: { code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบใหม่' } });

  const { token } = await registerMember();
  const missing = await call('GET', '/nope', { token });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');

  const badJson = await call('POST', '/auth/login', { body: '{bad json' });
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error.code, 'VALIDATION_ERROR');
  assert.ok(!JSON.stringify(badJson.body).includes('at '));

  const invalid = await call('POST', '/auth/register', { body: { email: 'x' } });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.error.details.some((d) => d.field === 'password'));
});

test('A2 login + M1 /me: วันเวลาเป็น ISO +07:00, ไม่มี passwordHash · login ผิด = 401', async () => {
  const { token, user } = await registerMember();
  const me = await call('GET', '/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.success, true);
  assert.equal(me.body.data.id, user.id);
  assert.match(me.body.data.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
  assert.ok(!JSON.stringify(me.body).toLowerCase().includes('passwordhash'));

  const wrong = await call('POST', '/auth/login', { body: { email: user.email, password: 'Wrong1234' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
  assert.equal((await call('POST', '/auth/logout', { token })).body.data, null);
});

test('สมาชิกเรียก endpoint แอดมิน = 403 · list มี meta (page, pageSize, total, totalPages)', async () => {
  const { token } = await registerMember();
  const forbidden = await call('GET', '/users', { token });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, 'FORBIDDEN');

  const list = await call('GET', '/notebooks?pageSize=2&sort=assetCode:asc', { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 2);
  assert.equal(list.body.meta.pageSize, 2);
  assert.equal(list.body.meta.totalPages, Math.ceil(list.body.meta.total / 2));
  assert.equal(list.body.data[0].serialNumber, undefined);
});

test('ลำดับ route: /notebooks/available, /notebooks/by-asset/:code, /loans/pending-return ไม่ถูกจับเป็น /:id', async () => {
  const { token } = await registerMember();
  const nb = await createNotebook();
  const start = new Date(Date.now() + 30 * HOUR).toISOString();
  const end = new Date(Date.now() + 31 * HOUR).toISOString();
  const avail = await call('GET', `/notebooks/available?startAt=${encodeURIComponent(start)}&endAt=${encodeURIComponent(end)}&modelId=${nb.modelId}`, { token });
  assert.equal(avail.status, 200);
  assert.deepEqual(avail.body.data.map((n) => n.id), [nb.id]);
  const scan = await call('GET', `/notebooks/by-asset/${nb.assetCode}`, { token });
  assert.equal(scan.body.data.id, nb.id);
  const adminToken = await loginAdmin();
  assert.equal((await call('GET', '/loans/pending-return', { token: adminToken })).status, 200);
});

test('flow สมาชิก: ยืม (201) → ดู actions → ต่อเวลา → กดคืน · แอดมินยืนยันรับคืน · ผิดกฎได้ 409/422', async () => {
  const { token } = await registerMember();
  const adminToken = await loginAdmin();
  const nb = await createNotebook();
  const dueAt = new Date(Date.now() + 2 * HOUR);
  dueAt.setMilliseconds(0);

  const borrowed = await call('POST', '/loans', { token, body: { notebookId: nb.id, dueAt: dueAt.toISOString() } });
  assert.equal(borrowed.status, 201);
  const loanId = borrowed.body.data.id;
  assert.equal(borrowed.body.data.loanStatus, 'borrowing');
  assert.equal(new Date(borrowed.body.data.dueAt).getTime(), dueAt.getTime());

  const again = await call('POST', '/loans', { token, body: { notebookId: nb.id, dueAt: dueAt.toISOString() } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'NOTEBOOK_ALREADY_BORROWED');

  const detail = await call('GET', `/loans/${loanId}`, { token });
  assert.equal(detail.body.data.actions.canExtend, true);
  const tooLong = await call('POST', `/loans/${loanId}/extend`, { token, body: { newDueAt: new Date(Date.now() + 30 * HOUR).toISOString() } });
  assert.equal(tooLong.status, 422);
  assert.equal(tooLong.body.error.code, 'LOAN_DURATION_EXCEEDED');
  assert.match(tooLong.body.error.details.maxDueAt, /\+07:00$/);

  const extended = await call('POST', `/loans/${loanId}/extend`, { token, body: { newDueAt: new Date(dueAt.getTime() + HOUR).toISOString() } });
  assert.equal(extended.status, 200);
  const returned = await call('POST', `/loans/${loanId}/return-request`, { token });
  assert.equal(returned.body.data.loanStatus, 'return_pending');

  const confirmed = await call('POST', `/loans/${loanId}/confirm-return`, { token: adminToken, body: { returnCondition: 'normal' } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.data.loan.loanStatus, 'returned');
  assert.deepEqual(confirmed.body.data.warnings, { affectedReservations: [] });

  const myLoans = await call('GET', '/me/loans', { token });
  assert.equal(myLoans.body.data[0].id, loanId);
});

test('จองแล้วรับเครื่อง: R1 201, R4 ยกเลิกของคนอื่นโดยสมาชิก = 404, S1 settings/public', async () => {
  const a = await registerMember();
  const b = await registerMember();
  const nb = await createNotebook();
  const startAt = new Date(Date.now() + 26 * HOUR).toISOString();
  const endAt = new Date(Date.now() + 28 * HOUR).toISOString();
  const created = await call('POST', '/reservations', { token: a.token, body: { notebookId: nb.id, startAt, endAt } });
  assert.equal(created.status, 201);
  assert.match(created.body.data.pickupDeadline, /\+07:00$/);
  const steal = await call('POST', `/reservations/${created.body.data.id}/cancel`, { token: b.token, body: { reason: 'x' } });
  assert.equal(steal.status, 404);
  const pickupEarly = await call('POST', `/reservations/${created.body.data.id}/pickup`, { token: a.token });
  assert.equal(pickupEarly.body.error.code, 'RESERVATION_NOT_STARTED');
  const pub = await call('GET', '/settings/public', { token: a.token });
  assert.equal(pub.body.data.maxLoanHours, 24);
});

test('M3 อัปโหลดรูปโปรไฟล์: png ได้ avatarUrl ที่เปิดได้จริง · ไฟล์ชนิดอื่น = 400 INVALID_FILE · ไม่แนบไฟล์ = 400', async () => {
  const { token } = await registerMember();
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'me.png');
  const ok = await call('POST', '/me/avatar', { token, form });
  assert.equal(ok.status, 200);
  assert.match(ok.body.data.avatarUrl, /^\/uploads\/avatars\/[\w-]+\.png$/);
  const file = await fetch(`${base}${ok.body.data.avatarUrl}`);
  assert.equal(file.status, 200);

  const bad = new FormData();
  bad.append('image', new Blob(['hello'], { type: 'text/plain' }), 'a.txt');
  const rejected = await call('POST', '/me/avatar', { token, form: bad });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, 'INVALID_FILE');
  assert.equal((await call('POST', '/me/avatar', { token, form: new FormData() })).body.error.code, 'INVALID_FILE');
});

test('แอดมิน: P5 monthly-loans เติมเดือนเป็น 0, G1 audit-logs, N4 เห็น activeLoan', async () => {
  const adminToken = await loginAdmin();
  const { user } = await registerMember();
  const nb = await createNotebook();
  await insertLoan(user, nb, -HOUR, HOUR);
  const monthly = await call('GET', '/reports/monthly-loans?fromMonth=2025-01&toMonth=2025-03', { token: adminToken });
  assert.deepEqual(monthly.body.data.map((m) => m.totalLoans), [0, 0, 0]);
  const logs = await call('GET', `/audit-logs?userId=${user.id}&action=REGISTER`, { token: adminToken });
  assert.equal(logs.body.meta.total, 1);
  const detail = await call('GET', `/notebooks/${nb.id}`, { token: adminToken });
  assert.equal(detail.body.data.activeLoan.userId, user.id);
  assert.equal(detail.body.data.serialNumber, nb.serialNumber);
});
