import { beforeEach, describe, expect, it } from 'vitest';
import { handle, initMock, loadDb, queueError, resetDb, setDelay } from '../../assets/js/mock/mockApi.js';
import * as clock from '../../assets/js/mock/mockClock.js';

const T0 = Date.parse('2026-10-08T16:30:00+07:00');
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms) => new Date(ms).toISOString();

async function call(method, path, { token, body, query } = {}) {
  const res = await handle({ method, path, body, query, token });
  return { status: res.status, ...res.body };
}

async function login(email) {
  const r = await call('POST', '/auth/login', { body: { email, password: 'Passw0rd' } });
  return r.data?.token;
}

beforeEach(() => {
  localStorage.clear();
  setDelay([0, 0]);
  clock.set(T0, { freeze: true });
  resetDb();
});

describe('Auth', () => {
  it('login สำเร็จได้ token + permissions ตาม role', async () => {
    const r = await call('POST', '/auth/login', { body: { email: 'member@example.com', password: 'Passw0rd' } });
    expect(r.status).toBe(200);
    expect(r.data.user.roleCode).toBe('member');
    expect(r.data.permissions).toContain('loan.create');
    expect(r.data.expiresAt).toMatch(/\+07:00$/);
  });

  it('รหัสผิด -> 401 INVALID_CREDENTIALS', async () => {
    const r = await call('POST', '/auth/login', { body: { email: 'member@example.com', password: 'wrong' } });
    expect([r.status, r.error.code]).toEqual([401, 'INVALID_CREDENTIALS']);
  });

  it('P-03 บัญชีถูกระงับ -> 403 ACCOUNT_SUSPENDED', async () => {
    const r = await call('POST', '/auth/login', { body: { email: 'suspended@example.com', password: 'Passw0rd' } });
    expect([r.status, r.error.code]).toEqual([403, 'ACCOUNT_SUSPENDED']);
    expect(r.error.message).toContain('ถูกระงับ');
  });

  it('ไม่มี token / token หมดอายุ -> 401 UNAUTHORIZED', async () => {
    expect((await call('GET', '/me')).error.code).toBe('UNAUTHORIZED');
    const token = await login('member@example.com');
    clock.set(T0 + 9 * HOUR, { freeze: true });
    expect((await call('GET', '/me', { token })).error.code).toBe('UNAUTHORIZED');
  });

  it('สมัครสมาชิกแล้วใช้งานได้ทันที และอีเมลซ้ำได้ EMAIL_TAKEN', async () => {
    const body = { email: 'new@example.com', password: 'Passw0rd', firstName: 'ใหม่', lastName: 'ทดสอบ', phone: '0899999999' };
    const r = await call('POST', '/auth/register', { body });
    expect(r.status).toBe(201);
    expect((await call('GET', '/me', { token: r.data.token })).data.email).toBe('new@example.com');
    expect((await call('POST', '/auth/register', { body })).error.code).toBe('EMAIL_TAKEN');
  });

  it('member code ซ้ำได้ MEMBER_CODE_TAKEN', async () => {
    const body = { email: 'n2@example.com', password: 'Passw0rd', firstName: 'ก', lastName: 'ข', phone: '0899999999', memberCode: '6501234' };
    expect((await call('POST', '/auth/register', { body })).error.code).toBe('MEMBER_CODE_TAKEN');
  });

  it('สมาชิกเรียก endpoint แอดมิน -> 403 FORBIDDEN', async () => {
    const token = await login('member@example.com');
    expect((await call('GET', '/loans/pending-return', { token })).error.code).toBe('FORBIDDEN');
  });
});

describe('D-01 ข้อมูลตั้งต้น / reset', () => {
  it('?mockReset=1 คืนข้อมูลกลับเป็นค่าตั้งต้น', async () => {
    const token = await login('member@example.com');
    const before = loadDb().loans.length;
    await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 + 2 * HOUR) } });
    expect(loadDb().loans.length).toBe(before + 1);

    initMock('?mockReset=1');
    expect(loadDb().loans.length).toBe(before);
  });

  it('ไม่มี ?mockReset ข้อมูลที่แก้ไว้ยังอยู่ข้ามหน้า', async () => {
    const token = await login('member@example.com');
    await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 + 2 * HOUR) } });
    initMock('');
    expect(loadDb().loans.some((l) => l.notebookId === 1 && l.status === 'borrowing')).toBe(true);
  });

  it('เครื่องครบทุก currentStatus', async () => {
    const token = await login('admin@example.com');
    const r = await call('GET', '/notebooks', { token, query: { pageSize: '100' } });
    const statuses = new Set(r.data.map((n) => n.currentStatus));
    expect([...statuses].sort()).toEqual(['available', 'borrowed', 'damaged', 'maintenance', 'reserved', 'retired']);
  });

  it('รอยืนยันรับคืน >= 3 รายการ มี 1 รายการคืนช้า เรียงกดคืนก่อนขึ้นก่อน', async () => {
    const token = await login('admin@example.com');
    const r = await call('GET', '/loans/pending-return', { token });
    expect(r.data.length).toBeGreaterThanOrEqual(3);
    expect(r.data.filter((l) => l.isLate)).toHaveLength(1);
    const times = r.data.map((l) => Date.parse(l.returnRequestedAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('แจ้งเตือนครบทุก type ที่ spec ระบุ', () => {
    const types = new Set(loadDb().notifications.map((n) => n.type));
    expect([...types].sort()).toEqual(['loan_cancelled', 'loan_due_soon', 'reservation_cancelled']);
  });

  it('สมาชิกไม่เห็น field ของแอดมิน, แอดมินเห็น', async () => {
    const m = await login('member@example.com');
    const a = await login('admin@example.com');
    expect((await call('GET', '/notebooks/1', { token: m })).data.serialNumber).toBeUndefined();
    expect((await call('GET', '/notebooks/1', { token: a })).data.serialNumber).toBe('SN000001');
  });

  it('ข้อมูลทุกเวลาตอบเป็น +07:00', async () => {
    const token = await login('member@example.com');
    const r = await call('GET', '/me/reservations', { token });
    for (const x of r.data) expect(x.startAt).toMatch(/\+07:00$/);
  });
});

describe('L1 ยืมทันที', () => {
  it('B-01 ยืมเครื่องว่างสำเร็จ ได้ Loan พร้อม actions', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 + 3 * HOUR) } });
    expect(r.status).toBe(201);
    expect(r.data.loanStatus).toBe('borrowing');
    expect(r.data.actions.canExtend).toBe(true);
    const mine = await call('GET', '/me/loans', { token, query: { status: 'borrowing' } });
    expect(mine.data).toHaveLength(1);
    expect((await call('GET', '/notebooks/1', { token })).data.currentStatus).toBe('borrowed');
  });

  it('ยืมด้วย assetCode แทน notebookId ได้', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/loans', { token, body: { assetCode: 'NB-2025-0001', dueAt: iso(T0 + HOUR) } });
    expect(r.status).toBe(201);
  });

  it('B-02 ยืมครบโควตา -> 422 LOAN_LIMIT_REACHED', async () => {
    const token = await login('member2@example.com');
    const r = await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 + HOUR) } });
    expect([r.status, r.error.code]).toEqual([422, 'LOAN_LIMIT_REACHED']);
  });

  it('เครื่องที่ถูกยืมอยู่ -> 409 NOTEBOOK_ALREADY_BORROWED', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/loans', { token, body: { notebookId: 3, dueAt: iso(T0 + HOUR) } });
    expect(r.error.code).toBe('NOTEBOOK_ALREADY_BORROWED');
  });

  it('เครื่องเสียหาย -> 409 NOTEBOOK_NOT_AVAILABLE', async () => {
    const token = await login('member@example.com');
    expect((await call('POST', '/loans', { token, body: { notebookId: 5, dueAt: iso(T0 + HOUR) } })).error.code).toBe('NOTEBOOK_NOT_AVAILABLE');
  });

  it('dueAt เกิน maxLoanHours หรืออดีต -> 400 INVALID_DUE_AT', async () => {
    const token = await login('member@example.com');
    expect((await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 + 24 * HOUR + MIN) } })).error.code).toBe('INVALID_DUE_AT');
    expect((await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 - MIN) } })).error.code).toBe('INVALID_DUE_AT');
    expect((await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 + 24 * HOUR) } })).status).toBe(201);
  });

  it('B-03 ทับการจองของคนอื่น -> RESERVATION_CONFLICT พร้อม availableUntil', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/loans', { token, body: { notebookId: 2, dueAt: iso(T0 + 24 * HOUR) } });
    expect([r.status, r.error.code]).toEqual([409, 'RESERVATION_CONFLICT']);
    expect(r.error.details.availableUntil).toBe('2026-10-09T09:00:00+07:00');
  });

  it('ยืมให้คืนก่อนเวลาจอง ผ่านได้', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/loans', { token, body: { notebookId: 2, dueAt: '2026-10-09T08:59:00+07:00' } });
    expect(r.status).toBe(201);
  });

  it('B-05 ทับการจองของตัวเอง -> OWN_RESERVATION_OVERLAP', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/loans', { token, body: { notebookId: 4, dueAt: iso(T0 + HOUR) } });
    expect(r.error.code).toBe('OWN_RESERVATION_OVERLAP');
    expect(r.error.details.reservationId).toBe(1);
  });

  it('คิวสั่ง error ให้ตอบครั้งเดียว (ใช้ใน test B-04)', async () => {
    const token = await login('member@example.com');
    queueError('POST', '^/loans$', { code: 'NOTEBOOK_ALREADY_BORROWED' });
    const body = { notebookId: 1, dueAt: iso(T0 + HOUR) };
    expect((await call('POST', '/loans', { token, body })).error.code).toBe('NOTEBOOK_ALREADY_BORROWED');
    expect((await call('POST', '/loans', { token, body })).status).toBe(201);
  });
});

describe('L3 ต่อเวลา / L4 คืน', () => {
  it('E-01 ต่อเวลาสำเร็จ dueAt ใหม่', async () => {
    const token = await login('member2@example.com');
    const loan = (await call('GET', '/loans/1', { token })).data;
    expect(loan.actions.canExtend).toBe(true);
    const newDueAt = iso(Date.parse(loan.dueAt) + HOUR);
    const r = await call('POST', '/loans/1/extend', { token, body: { newDueAt } });
    expect(r.status).toBe(200);
    expect(Date.parse(r.data.dueAt)).toBe(Date.parse(newDueAt));
  });

  it('ต่อเกิน maxLoanHours นับจากเวลายืม -> 422 LOAN_DURATION_EXCEEDED พร้อม maxDueAt', async () => {
    const token = await login('member2@example.com');
    const loan = (await call('GET', '/loans/1', { token })).data;
    const r = await call('POST', '/loans/1/extend', { token, body: { newDueAt: iso(Date.parse(loan.borrowedAt) + 24 * HOUR + MIN) } });
    expect([r.status, r.error.code]).toEqual([422, 'LOAN_DURATION_EXCEEDED']);
    expect(Date.parse(r.error.details.maxDueAt)).toBe(Date.parse(loan.borrowedAt) + 24 * HOUR);
  });

  it('E-02 ต่อชนการจองของคนอื่น -> EXTEND_CONFLICT_RESERVATION กำหนดคืนเดิมไม่เปลี่ยน', async () => {
    const token = await login('member@example.com');
    // ยืมเครื่อง 2 ให้คืนก่อนเวลาจองพรุ่งนี้ 09:00 แล้วลองต่อข้ามเวลาจอง
    const borrow = await call('POST', '/loans', { token, body: { notebookId: 2, dueAt: '2026-10-09T08:00:00+07:00' } });
    const r = await call('POST', `/loans/${borrow.data.id}/extend`, { token, body: { newDueAt: '2026-10-09T10:00:00+07:00' } });
    expect([r.status, r.error.code]).toEqual([409, 'EXTEND_CONFLICT_RESERVATION']);
    expect(r.error.details.maxDueAt).toBe('2026-10-09T09:00:00+07:00');
    const after = await call('GET', `/loans/${borrow.data.id}`, { token });
    expect(after.data.dueAt).toBe('2026-10-09T08:00:00+07:00');
  });

  it('เกินกำหนดแล้วต่อไม่ได้ -> LOAN_OVERDUE_CANNOT_EXTEND', async () => {
    const token = await login('member4@example.com');
    const r = await call('POST', '/loans/2/extend', { token, body: { newDueAt: iso(T0 + HOUR) } });
    expect(r.error.code).toBe('LOAN_OVERDUE_CANNOT_EXTEND');
  });

  it('R-01 กดคืน -> return_pending และกดซ้ำได้ RETURN_ALREADY_REQUESTED', async () => {
    const token = await login('member2@example.com');
    const r = await call('POST', '/loans/1/return-request', { token });
    expect(r.data.loanStatus).toBe('return_pending');
    expect(r.data.actions.canRequestReturn).toBe(false);
    expect((await call('POST', '/loans/1/return-request', { token })).error.code).toBe('RETURN_ALREADY_REQUESTED');
    expect((await call('POST', '/loans/1/extend', { token, body: { newDueAt: iso(T0 + 4 * HOUR) } })).error.code).toBe('LOAN_NOT_ACTIVE');
  });

  it('ยืมของคนอื่น -> 404 LOAN_NOT_FOUND', async () => {
    const token = await login('member@example.com');
    expect((await call('POST', '/loans/1/return-request', { token })).error.code).toBe('LOAN_NOT_FOUND');
  });
});

describe('L7 ยืนยันรับคืน', () => {
  it('R-02 คืนหลังเกินกำหนด -> returned และ isLate', async () => {
    const m = await login('member4@example.com');
    const a = await login('admin@example.com');
    clock.set(T0 + 10 * MIN, { freeze: true });
    const req = await call('POST', '/loans/2/return-request', { token: m });
    expect(req.data.isLate).toBe(true);
    const r = await call('POST', '/loans/2/confirm-return', { token: a, body: { returnCondition: 'normal' } });
    expect(r.data.loan.loanStatus).toBe('returned');
    expect(r.data.loan.isLate).toBe(true);
    const hist = await call('GET', '/me/loans', { token: m, query: { status: 'returned' } });
    expect(hist.data[0].isLate).toBe(true);
  });

  it('A-04 บันทึกรับคืนที่สมาชิกยังไม่กดคืน พร้อมระบุเวลา -> คำนวณคืนช้าตามเวลาที่ระบุ', async () => {
    const a = await login('admin@example.com');
    // loan 2 กำหนดคืน = T0 - 25 นาที
    const onTime = await call('POST', '/loans/2/confirm-return', {
      token: a, body: { returnCondition: 'normal', returnRequestedAt: iso(T0 - 30 * MIN) },
    });
    expect(onTime.data.loan.loanStatus).toBe('returned');
    expect(onTime.data.loan.isLate).toBe(false);
  });

  it('A-04 ระบุเวลาหลังกำหนดคืน -> isLate', async () => {
    const a = await login('admin@example.com');
    const r = await call('POST', '/loans/2/confirm-return', {
      token: a, body: { returnCondition: 'normal', returnRequestedAt: iso(T0 - 10 * MIN) },
    });
    expect(r.data.loan.isLate).toBe(true);
  });

  it('returnRequestedAt ในอนาคต / ก่อนยืม -> VALIDATION_ERROR', async () => {
    const a = await login('admin@example.com');
    const future = await call('POST', '/loans/2/confirm-return', { token: a, body: { returnCondition: 'normal', returnRequestedAt: iso(T0 + MIN) } });
    expect(future.error.code).toBe('VALIDATION_ERROR');
    expect(future.error.details[0].field).toBe('returnRequestedAt');
  });

  it('เสียหายไม่มีหมายเหตุ -> VALIDATION_ERROR ที่ returnNote', async () => {
    const a = await login('admin@example.com');
    const r = await call('POST', '/loans/3/confirm-return', { token: a, body: { returnCondition: 'damaged' } });
    expect(r.error.details.map((d) => d.field)).toEqual(['returnNote']);
  });

  it('A-03 รับคืนแบบเสียหายมีการจองในอนาคต -> เครื่องเสียหาย + affectedReservations แล้วยกเลิกได้', async () => {
    const m = await login('member@example.com');
    const a = await login('admin@example.com');
    // สมาชิกสร้างการจองในอนาคตบนเครื่อง 9 (เครื่องที่ xss ถืออยู่ รอรับคืน)
    const start = T0 + 48 * HOUR;
    const reserve = await call('POST', '/reservations', { token: m, body: { notebookId: 9, startAt: iso(start), endAt: iso(start + 3 * HOUR) } });
    expect(reserve.status).toBe(201);

    const r = await call('POST', '/loans/3/confirm-return', { token: a, body: { returnCondition: 'damaged', returnNote: 'จอแตก' } });
    expect(r.data.warnings.affectedReservations.map((x) => x.id)).toEqual([reserve.data.id]);
    expect((await call('GET', '/notebooks/9', { token: a })).data.currentStatus).toBe('damaged');

    const cancel = await call('POST', `/reservations/${reserve.data.id}/cancel`, { token: a, body: { reason: 'เครื่องเสียหาย' } });
    expect(cancel.data.status).toBe('cancelled');
  });

  it('รับคืนซ้ำ -> LOAN_ALREADY_RETURNED', async () => {
    const a = await login('admin@example.com');
    await call('POST', '/loans/3/confirm-return', { token: a, body: { returnCondition: 'normal' } });
    expect((await call('POST', '/loans/3/confirm-return', { token: a, body: { returnCondition: 'normal' } })).error.code).toBe('LOAN_ALREADY_RETURNED');
  });

  it('A-06 ยกเลิกรายการยืมไม่มีเหตุผล -> VALIDATION_ERROR', async () => {
    const a = await login('admin@example.com');
    expect((await call('POST', '/loans/1/cancel', { token: a, body: { reason: '' } })).error.code).toBe('VALIDATION_ERROR');
    expect((await call('POST', '/loans/1/cancel', { token: a, body: { reason: 'บันทึกผิด' } })).data.loanStatus).toBe('cancelled');
  });
});

describe('การจอง R1, R3, R4', () => {
  it('S-01 หาเครื่องว่างแล้วจอง การจองแสดงในรายการของฉัน', async () => {
    const token = await login('member@example.com');
    const startAt = '2026-10-09T13:00:00+07:00';
    const endAt = '2026-10-09T16:00:00+07:00';
    const avail = await call('GET', '/notebooks/available', { token, query: { startAt, endAt } });
    const codes = avail.data.map((n) => n.assetCode);
    expect(codes).toContain('NB-2025-0002');
    expect(codes).not.toContain('NB-2025-0005'); // เสียหาย

    const r = await call('POST', '/reservations', { token, body: { notebookId: 2, startAt, endAt } });
    expect(r.status).toBe(201);
    expect(r.data.status).toBe('upcoming');
    expect(r.data.pickupDeadline).toBe('2026-10-09T13:30:00+07:00');
    const mine = await call('GET', '/me/reservations', { token, query: { status: 'upcoming' } });
    expect(mine.data.map((x) => x.id)).toContain(r.data.id);
  });

  it('เครื่องที่มีจองทับช่วงเวลาไม่อยู่ในผลหาเครื่องว่าง และจองซ้ำได้ RESERVATION_CONFLICT', async () => {
    const token = await login('member@example.com');
    const q = { startAt: '2026-10-09T10:00:00+07:00', endAt: '2026-10-09T11:00:00+07:00' };
    const avail = await call('GET', '/notebooks/available', { token, query: q });
    expect(avail.data.map((n) => n.id)).not.toContain(2);
    expect((await call('POST', '/reservations', { token, body: { notebookId: 2, ...q } })).error.code).toBe('RESERVATION_CONFLICT');
  });

  it('กฎเวลา: อดีต/ end<=start -> INVALID_TIME_RANGE, เกิน 7 วัน -> RESERVATION_TOO_FAR_AHEAD', async () => {
    const token = await login('member@example.com');
    const body = (s, e) => ({ notebookId: 1, startAt: iso(s), endAt: iso(e) });
    expect((await call('POST', '/reservations', { token, body: body(T0 - MIN, T0 + HOUR) })).error.code).toBe('INVALID_TIME_RANGE');
    expect((await call('POST', '/reservations', { token, body: body(T0 + HOUR, T0 + HOUR) })).error.code).toBe('INVALID_TIME_RANGE');
    const far = await call('POST', '/reservations', { token, body: body(T0 + 7 * 24 * HOUR + MIN, T0 + 7 * 24 * HOUR + HOUR) });
    expect(far.error.code).toBe('RESERVATION_TOO_FAR_AHEAD');
    expect(far.error.message).toContain('7 วัน');
  });

  it('ทับการยืมที่ยังไม่คืน -> LOAN_CONFLICT', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/reservations', { token, body: { notebookId: 3, startAt: iso(T0 + HOUR), endAt: iso(T0 + 2 * HOUR) } });
    expect(r.error.code).toBe('LOAN_CONFLICT');
  });

  it('S-02 ยกเลิกการจองของตัวเอง -> cancelled และยกเลิกซ้ำไม่ได้', async () => {
    const token = await login('member@example.com');
    const r = await call('POST', '/reservations/3/cancel', { token });
    expect(r.data.status).toBe('cancelled');
    expect((await call('POST', '/reservations/3/cancel', { token })).error.code).toBe('RESERVATION_CANNOT_CANCEL');
  });

  it('ยกเลิกการจองของคนอื่น -> 404', async () => {
    const token = await login('member@example.com');
    expect((await call('POST', '/reservations/2/cancel', { token })).error.code).toBe('RESERVATION_NOT_FOUND');
  });

  it('แอดมินยกเลิกของคนอื่นต้องมีเหตุผล และเจ้าของได้แจ้งเตือน', async () => {
    const a = await login('admin@example.com');
    expect((await call('POST', '/reservations/2/cancel', { token: a, body: {} })).error.code).toBe('VALIDATION_ERROR');
    const before = loadDb().notifications.filter((n) => n.userId === 3).length;
    expect((await call('POST', '/reservations/2/cancel', { token: a, body: { reason: 'เครื่องส่งซ่อม' } })).data.status).toBe('cancelled');
    expect(loadDb().notifications.filter((n) => n.userId === 3).length).toBe(before + 1);
  });

  it('S-03 รับเครื่องตามที่จอง -> ได้ Loan ที่ dueAt = endAt ของการจอง', async () => {
    const token = await login('member@example.com');
    const res = (await call('GET', '/reservations/1', { token })).data;
    expect(res.status).toBe('active');
    const r = await call('POST', '/reservations/1/pickup', { token });
    expect(r.status).toBe(201);
    expect(r.data.reservationId).toBe(1);
    expect(r.data.dueAt).toBe(res.endAt);
    expect((await call('GET', '/reservations/1', { token })).data.status).toBe('fulfilled');
    expect((await call('POST', '/reservations/1/pickup', { token })).error.code).toBe('RESERVATION_ALREADY_PICKED_UP');
  });

  it('S-04 รับเครื่องหลังเลย pickupDeadline -> RESERVATION_EXPIRED', async () => {
    const token = await login('member@example.com');
    clock.set(T0 + 31 * MIN, { freeze: true });
    const r = await call('POST', '/reservations/1/pickup', { token });
    expect([r.status, r.error.code]).toEqual([409, 'RESERVATION_EXPIRED']);
    expect((await call('GET', '/reservations/1', { token })).data.status).toBe('expired');
  });

  it('ยังไม่ถึงเวลา -> RESERVATION_NOT_STARTED', async () => {
    const token = await login('member2@example.com');
    expect((await call('POST', '/reservations/2/pickup', { token })).error.code).toBe('RESERVATION_NOT_STARTED');
  });

  it('รับเครื่องแล้วยืมครบโควตา -> LOAN_LIMIT_REACHED', async () => {
    const token = await login('member@example.com');
    await call('POST', '/loans', { token, body: { notebookId: 1, dueAt: iso(T0 + HOUR) } });
    expect((await call('POST', '/reservations/1/pickup', { token })).error.code).toBe('LOAN_LIMIT_REACHED');
  });
});

describe('แจ้งเตือน (N-01, N-02)', () => {
  it('นับ ยังไม่อ่าน อ่านทีละรายการ และอ่านทั้งหมด', async () => {
    const token = await login('member@example.com');
    expect((await call('GET', '/me/notifications/unread-count', { token })).data.count).toBe(1);

    window.__mock.addNotification(2);
    expect((await call('GET', '/me/notifications/unread-count', { token })).data.count).toBe(2);

    const list = await call('GET', '/me/notifications', { token, query: { unreadOnly: 'true' } });
    expect(list.data).toHaveLength(2);
    expect((await call('PATCH', `/me/notifications/${list.data[0].id}/read`, { token })).data).toBeNull();
    expect((await call('GET', '/me/notifications/unread-count', { token })).data.count).toBe(1);

    expect((await call('PATCH', '/me/notifications/read-all', { token })).data.updated).toBe(1);
    expect((await call('GET', '/me/notifications/unread-count', { token })).data.count).toBe(0);
    expect((await call('PATCH', '/me/notifications/9999/read', { token })).error.code).toBe('NOTIFICATION_NOT_FOUND');
  });
});

describe('โปรไฟล์', () => {
  it('แก้ชื่อ/เบอร์ และตรวจ validation', async () => {
    const token = await login('member@example.com');
    expect((await call('PATCH', '/me', { token, body: { lastName: 'ใจดีมาก', phone: '0899999999' } })).data.lastName).toBe('ใจดีมาก');
    const bad = await call('PATCH', '/me', { token, body: { phone: '081' } });
    expect(bad.error.details[0].field).toBe('phone');
  });

  it('เปลี่ยนรหัสผ่าน: รหัสเดิมผิด / ไม่ตามนโยบาย / สำเร็จแล้ว login ด้วยรหัสใหม่ได้', async () => {
    const token = await login('member@example.com');
    expect((await call('PUT', '/me/password', { token, body: { currentPassword: 'x', newPassword: 'NewPassw0rd' } })).error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect((await call('PUT', '/me/password', { token, body: { currentPassword: 'Passw0rd', newPassword: 'abcdefgh' } })).error.code).toBe('VALIDATION_ERROR');
    expect((await call('PUT', '/me/password', { token, body: { currentPassword: 'Passw0rd', newPassword: 'NewPassw0rd' } })).status).toBe(200);
    const again = await call('POST', '/auth/login', { body: { email: 'member@example.com', password: 'NewPassw0rd' } });
    expect(again.status).toBe(200);
  });

  it('อัปโหลดรูปผิดชนิด -> INVALID_FILE', async () => {
    const token = await login('member@example.com');
    const bad = await handle({ method: 'POST', path: '/me/avatar', token, file: { type: 'image/gif', size: 10 } });
    expect(bad.body.error.code).toBe('INVALID_FILE');
    const good = await handle({ method: 'POST', path: '/me/avatar', token, file: { type: 'image/png', size: 10 } });
    expect(good.body.data.avatarUrl).toMatch(/^data:image\/svg\+xml/);
  });
});
