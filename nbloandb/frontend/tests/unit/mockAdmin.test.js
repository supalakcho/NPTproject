import { beforeEach, describe, expect, it } from 'vitest';
import { handle, loadDb, resetDb, setDelay } from '../../assets/js/mock/mockApi.js';
import * as clock from '../../assets/js/mock/mockClock.js';
import { monthOf } from '../../assets/js/utils/datetime.js';
import { validateMonthRange } from '../../assets/js/utils/validate.js';

const T0 = Date.parse('2026-10-08T16:30:00+07:00');
const HOUR = 3_600_000;

async function call(method, path, { token, body, query } = {}) {
  const res = await handle({ method, path, body, query, token });
  return { status: res.status, ...res.body };
}

let admin;
let member;
beforeEach(async () => {
  localStorage.clear();
  setDelay([0, 0]);
  clock.set(T0, { freeze: true });
  resetDb();
  const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: 'Passw0rd' } })).data.token;
  admin = await login('admin@example.com');
  member = await login('member@example.com');
});

describe('สิทธิ์ของ endpoint แอดมิน', () => {
  it('สมาชิกเรียกได้ 403 FORBIDDEN ทุกกลุ่ม', async () => {
    for (const [method, path] of [['GET', '/users'], ['GET', '/settings'], ['GET', '/reports/summary'], ['GET', '/audit-logs'], ['POST', '/brands'], ['DELETE', '/notebooks/1']]) {
      expect((await call(method, path, { token: member })).error.code).toBe('FORBIDDEN');
    }
  });
});

describe('ยี่ห้อ / รุ่น', () => {
  it('ชื่อซ้ำ (ไม่สนตัวพิมพ์) -> BRAND_NAME_TAKEN, ชื่อว่าง -> VALIDATION_ERROR', async () => {
    expect((await call('POST', '/brands', { token: admin, body: { name: 'lenovo' } })).error.code).toBe('BRAND_NAME_TAKEN');
    expect((await call('POST', '/brands', { token: admin, body: { name: ' ' } })).error.code).toBe('VALIDATION_ERROR');
    expect((await call('POST', '/brands', { token: admin, body: { name: 'Samsung' } })).status).toBe(201);
  });

  it('B5 ลบยี่ห้อที่มีรุ่น -> BRAND_IN_USE พร้อม activeModels, ลบแล้วกู้คืนได้', async () => {
    const r = await call('DELETE', '/brands/1', { token: admin });
    expect([r.status, r.error.code, r.error.details]).toEqual([409, 'BRAND_IN_USE', { activeModels: 2 }]);
    const made = await call('POST', '/brands', { token: admin, body: { name: 'Samsung' } });
    expect((await call('DELETE', `/brands/${made.data.id}`, { token: admin })).data).toBeNull();
    const list = await call('GET', '/brands', { token: admin, query: { includeDeleted: 'true' } });
    expect(list.data.find((b) => b.id === made.data.id).deletedAt).toMatch(/\+07:00$/);
    expect((await call('POST', `/brands/${made.data.id}/restore`, { token: admin })).data.deletedAt).toBeNull();
  });

  it('D3 กฎช่วงค่า, ยี่ห้อไม่มี, ชื่อรุ่นซ้ำในยี่ห้อเดียวกัน', async () => {
    const ok = { brandId: 2, modelName: 'Latitude 7440', cpu: 'i7', ramGb: 32, storageGb: 1024, screenInch: 14, os: 'Win' };
    expect((await call('POST', '/notebook-models', { token: admin, body: { ...ok, ramGb: 257 } })).error.details[0].field).toBe('ramGb');
    expect((await call('POST', '/notebook-models', { token: admin, body: { ...ok, brandId: 99 } })).error.code).toBe('BRAND_NOT_FOUND');
    expect((await call('POST', '/notebook-models', { token: admin, body: { ...ok, brandId: 2, modelName: 'latitude 5440' } })).error.code).toBe('MODEL_NAME_TAKEN');
    expect((await call('POST', '/notebook-models', { token: admin, body: ok })).status).toBe(201);
  });

  it('D6 ลบรุ่นที่มีเครื่อง -> MODEL_IN_USE พร้อม activeNotebooks', async () => {
    const r = await call('DELETE', '/notebook-models/1', { token: admin });
    expect([r.error.code, r.error.details]).toEqual(['MODEL_IN_USE', { activeNotebooks: 3 }]); // เครื่อง 1, 3, 8 (เครื่อง 15 เป็นรุ่นนี้ด้วยแต่ถูกลบแล้ว)
  });
});

describe('เครื่อง N5–N8', () => {
  const body = { modelId: 1, assetCode: 'NB-2026-0001', serialNumber: 'SN-X', conditionStatus: 'normal', purchasedAt: '2026-01-01' };

  it('เพิ่มเครื่อง: รหัส/serial ซ้ำ, ไม่มีรุ่น', async () => {
    expect((await call('POST', '/notebooks', { token: admin, body })).status).toBe(201);
    expect((await call('POST', '/notebooks', { token: admin, body })).error.code).toBe('ASSET_CODE_TAKEN');
    expect((await call('POST', '/notebooks', { token: admin, body: { ...body, assetCode: 'NB-2026-0002' } })).error.code).toBe('SERIAL_NUMBER_TAKEN');
    expect((await call('POST', '/notebooks', { token: admin, body: { ...body, assetCode: 'NB-2026-0003', serialNumber: 'S3', modelId: 99 } })).error.code).toBe('MODEL_NOT_FOUND');
  });

  it('A-05 ลบเครื่องที่มีการจองในอนาคต -> NOTEBOOK_HAS_COMMITMENTS พร้อมจำนวน', async () => {
    const r = await call('DELETE', '/notebooks/2', { token: admin });
    expect([r.status, r.error.code, r.error.details]).toEqual([409, 'NOTEBOOK_HAS_COMMITMENTS', { activeLoans: 0, upcomingReservations: 1 }]);
    const borrowed = await call('DELETE', '/notebooks/3', { token: admin });
    expect(borrowed.error.details).toEqual({ activeLoans: 1, upcomingReservations: 0 });
  });

  it('ลบเครื่องว่างแล้วหายจากรายการของสมาชิก และกู้คืนได้', async () => {
    expect((await call('DELETE', '/notebooks/13', { token: admin })).data).toBeNull();
    expect((await call('GET', '/notebooks/13', { token: member })).error.code).toBe('NOTEBOOK_NOT_FOUND');
    expect((await call('POST', '/notebooks/13/restore', { token: admin })).data.deletedAt).toBeNull();
    expect((await call('GET', '/notebooks/13', { token: member })).status).toBe(200);
  });

  it('N6 เปลี่ยนเป็นซ่อมบำรุงขณะมีการจอง -> warnings.affectedReservations', async () => {
    const r = await call('PATCH', '/notebooks/2', { token: admin, body: { conditionStatus: 'maintenance' } });
    expect(r.data.notebook.conditionStatus).toBe('maintenance');
    expect(r.data.notebook.currentStatus).toBe('maintenance');
    expect(r.data.warnings.affectedReservations).toEqual([{ id: 2, startAt: '2026-10-09T09:00:00+07:00', userFullName: 'สมหญิง รักเรียน' }]);
  });

  it('N6 เปลี่ยนเป็นปลดระวางขณะมีภาระ -> NOTEBOOK_HAS_COMMITMENTS', async () => {
    expect((await call('PATCH', '/notebooks/3', { token: admin, body: { conditionStatus: 'retired' } })).error.code).toBe('NOTEBOOK_HAS_COMMITMENTS');
  });

  it('N1 includeDeleted ใช้ได้เฉพาะแอดมิน', async () => {
    const a = await call('GET', '/notebooks', { token: admin, query: { includeDeleted: 'true', pageSize: '100' } });
    const m = await call('GET', '/notebooks', { token: member, query: { includeDeleted: 'true', pageSize: '100' } });
    expect(a.data.some((n) => n.id === 15)).toBe(true);
    expect(m.data.some((n) => n.id === 15)).toBe(false);
  });
});

describe('สมาชิก U1–U7', () => {
  it('A-07 ระงับ/ลบบัญชีตัวเอง -> CANNOT_MODIFY_SELF', async () => {
    expect((await call('POST', '/users/1/suspend', { token: admin })).error.code).toBe('CANNOT_MODIFY_SELF');
    expect((await call('DELETE', '/users/1', { token: admin })).error.code).toBe('CANNOT_MODIFY_SELF');
  });

  it('ระงับ/เปิดใช้งาน/ลบ/กู้คืน และผู้ถูกระงับ login ไม่ได้', async () => {
    expect((await call('POST', '/users/6/suspend', { token: admin })).data.isActive).toBe(false);
    expect((await call('POST', '/auth/login', { body: { email: 'member3@example.com', password: 'Passw0rd' } })).error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await call('POST', '/users/6/activate', { token: admin })).data.isActive).toBe(true);
    // user 2 ไม่มีรายการยืมค้าง (มีแค่การจอง) จึงลบได้
    expect((await call('DELETE', '/users/2', { token: admin })).data).toBeNull();
    expect((await call('GET', '/users', { token: admin, query: { keyword: 'member@example.com' } })).data).toHaveLength(0);
    expect((await call('POST', '/users/2/restore', { token: admin })).data.deletedAt).toBeNull();
  });

  it('ลบผู้ใช้ที่ยังมีเครื่องค้าง -> USER_HAS_ACTIVE_LOANS', async () => {
    expect((await call('DELETE', '/users/3', { token: admin })).error.code).toBe('USER_HAS_ACTIVE_LOANS');
  });

  it('LAST_ADMIN: เพิ่มแอดมินคนที่สองแล้วระงับคนแรกจากบัญชีใหม่ได้, แต่ระงับคนสุดท้ายไม่ได้', async () => {
    const r = await call('PATCH', '/users/2', { token: admin, body: { roleId: 1 } });
    expect(r.data.roleCode).toBe('admin');
    const second = (await call('POST', '/auth/login', { body: { email: 'member@example.com', password: 'Passw0rd' } })).data.token;
    expect((await call('POST', '/users/1/suspend', { token: second })).data.isActive).toBe(false);
    expect((await call('POST', '/users/2/suspend', { token: second })).error.code).toBe('CANNOT_MODIFY_SELF');
    // แอดมินคนแรกถูกระงับแล้ว คนที่ 2 เหลือคนเดียว เปลี่ยน role ตัวเองลงไม่ได้
    expect((await call('PATCH', '/users/2', { token: second, body: { roleId: 2 } })).error.code).toBe('LAST_ADMIN');
  });

  it('U3 อีเมล/รหัสสมาชิกซ้ำ, U2 มี activeLoanCount', async () => {
    expect((await call('PATCH', '/users/6', { token: admin, body: { email: 'member@example.com' } })).error.code).toBe('EMAIL_TAKEN');
    expect((await call('PATCH', '/users/6', { token: admin, body: { memberCode: '6501234' } })).error.code).toBe('MEMBER_CODE_TAKEN');
    expect((await call('GET', '/users/3', { token: admin })).data.activeLoanCount).toBe(1);
    expect((await call('GET', '/users/999', { token: admin })).error.code).toBe('USER_NOT_FOUND');
  });
});

describe('ตั้งค่า S2–S3', () => {
  it('อ่านครบ 5 ค่า', async () => {
    const r = await call('GET', '/settings', { token: admin });
    expect(r.data.map((s) => s.key).sort()).toEqual(['maxActiveLoansPerUser', 'maxLoanHours', 'reminderBeforeMinutes', 'reservationGraceMinutes', 'reservationMaxDaysAhead']);
  });

  it('A-08 ค่าหนึ่งผิดช่วง -> ไม่บันทึกค่าใดเลย', async () => {
    const r = await call('PATCH', '/settings', { token: admin, body: { maxLoanHours: 12, maxActiveLoansPerUser: 9 } });
    expect([r.status, r.error.code, r.error.details[0].field]).toEqual([400, 'VALIDATION_ERROR', 'maxActiveLoansPerUser']);
    expect(loadDb().settings.maxLoanHours).toBe(24);
  });

  it('UNKNOWN_SETTING และบันทึกสำเร็จมีผลกับ S1 ทันที (V-08)', async () => {
    expect((await call('PATCH', '/settings', { token: admin, body: { nope: 1 } })).error.code).toBe('UNKNOWN_SETTING');
    expect((await call('PATCH', '/settings', { token: admin, body: { maxLoanHours: 12 } })).status).toBe(200);
    expect((await call('GET', '/settings/public', { token: member })).data.maxLoanHours).toBe(12);
    expect((await call('POST', '/loans', { token: member, body: { notebookId: 1, dueAt: new Date(T0 + 13 * HOUR).toISOString() } })).error.code).toBe('INVALID_DUE_AT');
  });
});

describe('รายงาน P1–P5', () => {
  it('P1 ผลรวมแต่ละสถานะเท่ากับจำนวนเครื่องทั้งหมด', async () => {
    const { data } = await call('GET', '/reports/summary', { token: admin });
    const { total, ...parts } = data;
    expect(Object.values(parts).reduce((a, b) => a + b, 0)).toBe(total);
    expect(total).toBe(14);
    expect(parts).toMatchObject({ available: 5, borrowed: 5, reserved: 1, damaged: 1, maintenance: 1, retired: 1 });
  });

  it('P3 ยืมค้าง เกินกำหนดขึ้นก่อน', async () => {
    const { data } = await call('GET', '/reports/outstanding-loans', { token: admin });
    expect(data[0].loanStatus).toBe('overdue');
    expect(data.every((l) => ['borrowing', 'overdue', 'return_pending'].includes(l.loanStatus))).toBe(true);
    expect((await call('GET', '/reports/outstanding-loans', { token: admin, query: { status: 'return_pending' } })).data).toHaveLength(3);
  });

  it('P4 เครื่องว่างเท่านั้น', async () => {
    const { data } = await call('GET', '/reports/available-notebooks', { token: admin });
    expect(data.every((n) => n.currentStatus === 'available')).toBe(true);
  });

  it('P5 ทุกเดือนในช่วงมีข้อมูล (เดือนว่างเป็น 0) ไม่นับที่ยกเลิก', async () => {
    const { data } = await call('GET', '/reports/monthly-loans', { token: admin, query: { fromMonth: '2026-05', toMonth: '2026-10' } });
    expect(data.map((r) => r.loanMonth)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(data[0]).toEqual({ loanMonth: '2026-05', totalLoans: 0, lateLoans: 0 });
    const oct = data.at(-1);
    // ต.ค.: loan 1–5 และ 7 (ยืมเมื่อ 6 วันก่อน) = 6 · loan 6 ยืมเมื่อ 10 วันก่อนจึงอยู่ ก.ย. · loan 8 ถูกยกเลิกไม่นับ
    expect(oct.totalLoans).toBe(6);
    expect(oct.lateLoans).toBe(3); // loan 2 (เกินกำหนด), 4 (คืนช้า), 7 (คืนช้า)
  });

  it('P5 ช่วงเกิน 24 เดือน / รูปแบบผิด -> VALIDATION_ERROR', async () => {
    expect((await call('GET', '/reports/monthly-loans', { token: admin, query: { fromMonth: '2024-01', toMonth: '2026-10' } })).error.code).toBe('VALIDATION_ERROR');
    expect((await call('GET', '/reports/monthly-loans', { token: admin, query: { fromMonth: '2024-10', toMonth: '2026-10' } })).status).toBe(200);
    expect((await call('GET', '/reports/monthly-loans', { token: admin, query: { fromMonth: '2026-1', toMonth: '2026-10' } })).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Audit log G1–G2', () => {
  it('การแก้ข้อมูลถูกบันทึก และกรองตามตาราง/ผู้กระทำได้', async () => {
    const before = (await call('GET', '/audit-logs', { token: admin })).meta.total;
    await call('POST', '/brands', { token: admin, body: { name: 'Samsung' } });
    await call('POST', '/loans/3/confirm-return', { token: admin, body: { returnCondition: 'normal' } });
    const all = await call('GET', '/audit-logs', { token: admin });
    expect(all.meta.total).toBe(before + 2);
    expect(all.data[0].targetTable).toBe('loans');
    const brands = await call('GET', '/audit-logs', { token: admin, query: { targetTable: 'brands', action: 'create' } });
    expect(brands.data.map((a) => a.newValues.name)).toContain('Samsung');
    expect((await call('GET', `/audit-logs/${brands.data[0].id}`, { token: admin })).data.userFullName).toBe('ผู้ดูแล ระบบ');
    expect((await call('GET', '/audit-logs/99999', { token: admin })).status).toBe(404);
  });
});

describe('ตัวช่วยฝั่ง frontend ของรายงานรายเดือน', () => {
  it('validateMonthRange: 24 เดือนพอดีผ่าน, 25 ไม่ผ่าน, ย้อนหลังไม่ผ่าน, รูปแบบผิดไม่ผ่าน', () => {
    expect(validateMonthRange({ fromMonth: '2024-10', toMonth: '2026-10' }).valid).toBe(true);
    expect(validateMonthRange({ fromMonth: '2024-09', toMonth: '2026-10' }).errors.toMonth).toContain('24 เดือน');
    expect(validateMonthRange({ fromMonth: '2026-10', toMonth: '2026-09' }).valid).toBe(false);
    expect(validateMonthRange({ fromMonth: '', toMonth: '2026-10' }).errors.fromMonth).toBeTruthy();
  });

  it('monthOf คิดเดือนตามเวลาไทยและข้ามปีได้', () => {
    expect(monthOf(Date.parse('2026-10-08T16:30:00+07:00'))).toBe('2026-10');
    expect(monthOf(Date.parse('2026-09-30T20:00:00Z'))).toBe('2026-10'); // 01 ต.ค. 03:00 ไทย
    expect(monthOf(Date.parse('2026-01-15T00:00:00+07:00'), -2)).toBe('2025-11');
    expect(monthOf(Date.parse('2026-12-15T00:00:00+07:00'), 1)).toBe('2027-01');
  });
});
