import { describe, expect, it } from 'vitest';
import {
  validateAdminReason, validateBorrow, validateChangePassword, validateConfirmReturn, validateExtend,
  validateImage, validateLogin, validateModel, validateProfile, validateRegister, validateReservation,
  validateSettings,
} from '../../assets/js/utils/validate.js';
import { toThaiIso } from '../../assets/js/utils/datetime.js';

const NOW = Date.parse('2026-10-08T10:00:00+07:00');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const settings = { maxLoanHours: 24, reservationMaxDaysAhead: 7, reservationGraceMinutes: 30, maxActiveLoansPerUser: 1 };
const at = (ms) => toThaiIso(ms);

describe('ยืมทันที (V-01..V-03, V-08)', () => {
  it('V-01 เวลาคืนในอดีต -> error ใต้ช่อง dueAt', () => {
    const r = validateBorrow({ dueAt: at(NOW - MIN) }, { now: NOW, settings });
    expect(r.valid).toBe(false);
    expect(r.errors.dueAt).toBeTruthy();
  });

  it('เวลาคืน = ตอนนี้พอดี ถือว่าไม่ใช่อนาคต', () => {
    expect(validateBorrow({ dueAt: at(NOW) }, { now: NOW, settings }).valid).toBe(false);
  });

  it('V-02 now + 24 ชม. 1 นาที -> error เกิน 24 ชั่วโมง', () => {
    const r = validateBorrow({ dueAt: at(NOW + 24 * HOUR + MIN) }, { now: NOW, settings });
    expect(r.valid).toBe(false);
    expect(r.errors.dueAt).toContain('24 ชั่วโมง');
  });

  it('V-03 now + 24 ชม. พอดี -> ผ่าน (ค่าขอบ)', () => {
    expect(validateBorrow({ dueAt: at(NOW + 24 * HOUR) }, { now: NOW, settings }).valid).toBe(true);
  });

  it('V-08 maxLoanHours = 12 -> จำกัดที่ 12 ชม.', () => {
    const s = { ...settings, maxLoanHours: 12 };
    expect(validateBorrow({ dueAt: at(NOW + 12 * HOUR) }, { now: NOW, settings: s }).valid).toBe(true);
    const over = validateBorrow({ dueAt: at(NOW + 12 * HOUR + MIN) }, { now: NOW, settings: s });
    expect(over.valid).toBe(false);
    expect(over.errors.dueAt).toContain('12 ชั่วโมง');
  });

  it('ไม่เลือกเวลา -> error', () => {
    expect(validateBorrow({ dueAt: null }, { now: NOW, settings }).errors.dueAt).toBeTruthy();
  });
});

describe('จอง (V-04, V-05)', () => {
  const start = NOW + 2 * HOUR;

  it('จองปกติ ผ่าน', () => {
    expect(validateReservation({ startAt: at(start), endAt: at(start + 3 * HOUR) }, { now: NOW, settings }).valid).toBe(true);
  });

  it('V-04 เริ่ม now + 7 วัน 1 นาที -> error จองล่วงหน้าเกิน 7 วัน', () => {
    const s = NOW + 7 * DAY + MIN;
    const r = validateReservation({ startAt: at(s), endAt: at(s + HOUR) }, { now: NOW, settings });
    expect(r.valid).toBe(false);
    expect(r.errors.startAt).toContain('7 วัน');
  });

  it('เริ่ม now + 7 วันพอดี -> ผ่าน', () => {
    const s = NOW + 7 * DAY;
    expect(validateReservation({ startAt: at(s), endAt: at(s + HOUR) }, { now: NOW, settings }).valid).toBe(true);
  });

  it('V-05 endAt <= startAt -> error', () => {
    expect(validateReservation({ startAt: at(start), endAt: at(start) }, { now: NOW, settings }).errors.endAt).toBeTruthy();
    expect(validateReservation({ startAt: at(start), endAt: at(start - MIN) }, { now: NOW, settings }).errors.endAt).toBeTruthy();
  });

  it('ช่วงยาวเกิน maxLoanHours -> error', () => {
    const r = validateReservation({ startAt: at(start), endAt: at(start + 24 * HOUR + MIN) }, { now: NOW, settings });
    expect(r.errors.endAt).toBeTruthy();
  });

  it('เริ่มในอดีต -> error', () => {
    expect(validateReservation({ startAt: at(NOW - MIN), endAt: at(NOW + HOUR) }, { now: NOW, settings }).errors.startAt).toBeTruthy();
  });
});

describe('ต่อเวลา (V-06)', () => {
  const dueAt = at(NOW + 2 * HOUR);
  const maxExtendDueAt = at(NOW + 6 * HOUR);

  it('ต่อภายในเพดาน ผ่าน (รวมค่าขอบ)', () => {
    expect(validateExtend({ newDueAt: at(NOW + 5 * HOUR) }, { dueAt, maxExtendDueAt }).valid).toBe(true);
    expect(validateExtend({ newDueAt: maxExtendDueAt }, { dueAt, maxExtendDueAt }).valid).toBe(true);
  });

  it('เกิน maxExtendDueAt -> error และแสดงเวลาสูงสุดที่ต่อได้', () => {
    const r = validateExtend({ newDueAt: at(NOW + 6 * HOUR + MIN) }, { dueAt, maxExtendDueAt });
    expect(r.valid).toBe(false);
    expect(r.errors.newDueAt).toContain('ต่อเวลาได้ไม่เกิน');
    expect(r.errors.newDueAt).toContain('16:00'); // 10:00 + 6 ชม. เวลาไทย
  });

  it('ไม่หลังกำหนดคืนเดิม -> error', () => {
    expect(validateExtend({ newDueAt: dueAt }, { dueAt, maxExtendDueAt }).valid).toBe(false);
  });
});

describe('สมัครสมาชิก / โปรไฟล์ / รหัสผ่าน (V-07)', () => {
  const good = { email: 'a@example.com', password: 'Passw0rd', firstName: 'สมชาย', lastName: 'ใจดี', phone: '0812345678', memberCode: '' };

  it('ข้อมูลถูกต้อง ผ่าน', () => {
    expect(validateRegister(good).valid).toBe(true);
  });

  it('V-07 รหัสผ่านไม่มีตัวเลข และเบอร์ 9 หลัก -> error ตรงช่อง', () => {
    const r = validateRegister({ ...good, password: 'abcdefgh', phone: '081234567' });
    expect(r.valid).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['password', 'phone']);
  });

  it('รหัสผ่านสั้นกว่า 8, อีเมลผิดรูปแบบ, เบอร์ไม่ขึ้นต้น 0', () => {
    const r = validateRegister({ ...good, password: 'Ab1', email: 'not-email', phone: '1812345678' });
    expect(Object.keys(r.errors).sort()).toEqual(['email', 'password', 'phone']);
  });

  it('ชื่อว่าง/ยาวเกิน 100, memberCode เกิน 30', () => {
    const r = validateRegister({ ...good, firstName: ' ', lastName: 'ก'.repeat(101), memberCode: 'x'.repeat(31) });
    expect(Object.keys(r.errors).sort()).toEqual(['firstName', 'lastName', 'memberCode']);
  });

  it('ค่าขอบของความยาว: ชื่อ 100 ตัวผ่าน, memberCode 30 ตัวผ่าน', () => {
    expect(validateRegister({ ...good, firstName: 'ก'.repeat(100), memberCode: 'x'.repeat(30) }).valid).toBe(true);
  });

  it('login ต้องกรอกทั้งสองช่อง', () => {
    expect(Object.keys(validateLogin({ email: '', password: '' }).errors)).toEqual(['email', 'password']);
  });

  it('แก้โปรไฟล์', () => {
    expect(validateProfile({ firstName: 'ก', lastName: 'ข', phone: '0899999999' }).valid).toBe(true);
    expect(validateProfile({ firstName: '', lastName: 'ข', phone: '089' }).valid).toBe(false);
  });

  it('เปลี่ยนรหัสผ่าน: ต้องตามนโยบาย ไม่ซ้ำเดิม ยืนยันตรงกัน', () => {
    const ok = { currentPassword: 'Passw0rd', newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' };
    expect(validateChangePassword(ok).valid).toBe(true);
    expect(validateChangePassword({ ...ok, newPassword: 'Passw0rd', confirmPassword: 'Passw0rd' }).errors.newPassword).toBeTruthy();
    expect(validateChangePassword({ ...ok, confirmPassword: 'x' }).errors.confirmPassword).toBeTruthy();
    expect(validateChangePassword({ ...ok, newPassword: 'abcdefgh', confirmPassword: 'abcdefgh' }).errors.newPassword).toBeTruthy();
  });
});

describe('ยืนยันรับคืน (V-09)', () => {
  const borrowedAt = at(NOW - 5 * HOUR);

  it('ไม่เลือกสภาพ -> error', () => {
    expect(validateConfirmReturn({ returnCondition: '' }, { now: NOW, borrowedAt }).errors.returnCondition).toBeTruthy();
  });

  it('V-09 เสียหายไม่กรอกหมายเหตุ -> error', () => {
    const r = validateConfirmReturn({ returnCondition: 'damaged', returnNote: '  ' }, { now: NOW, borrowedAt });
    expect(r.valid).toBe(false);
    expect(r.errors.returnNote).toBeTruthy();
  });

  it('เสียหายพร้อมหมายเหตุ 500 ตัวผ่าน, 501 ตัวไม่ผ่าน', () => {
    const base = { returnCondition: 'damaged' };
    expect(validateConfirmReturn({ ...base, returnNote: 'ก'.repeat(500) }, { now: NOW, borrowedAt }).valid).toBe(true);
    expect(validateConfirmReturn({ ...base, returnNote: 'ก'.repeat(501) }, { now: NOW, borrowedAt }).valid).toBe(false);
  });

  it('สภาพปกติไม่ต้องมีหมายเหตุ', () => {
    expect(validateConfirmReturn({ returnCondition: 'normal' }, { now: NOW, borrowedAt }).valid).toBe(true);
  });

  it('returnRequestedAt ต้องอยู่ระหว่าง borrowedAt ถึง now', () => {
    const base = { returnCondition: 'normal' };
    expect(validateConfirmReturn({ ...base, returnRequestedAt: at(NOW - HOUR) }, { now: NOW, borrowedAt }).valid).toBe(true);
    expect(validateConfirmReturn({ ...base, returnRequestedAt: at(NOW + MIN) }, { now: NOW, borrowedAt }).valid).toBe(false);
    expect(validateConfirmReturn({ ...base, returnRequestedAt: at(NOW - 6 * HOUR) }, { now: NOW, borrowedAt }).valid).toBe(false);
  });
});

describe('ฟอร์มอื่น', () => {
  it('A-06 ยกเลิกโดยแอดมินต้องมีเหตุผล', () => {
    expect(validateAdminReason({ reason: '' }).valid).toBe(false);
    expect(validateAdminReason({ reason: '   ' }).valid).toBe(false);
    expect(validateAdminReason({ reason: 'บันทึกผิด' }).valid).toBe(true);
  });

  it('รุ่น: ramGb 1–256, storageGb 1–8192, screenInch 10–18', () => {
    const ok = { brandId: '1', modelName: 'X', cpu: 'i5', os: 'Win', ramGb: '16', storageGb: '512', screenInch: '14' };
    expect(validateModel(ok).valid).toBe(true);
    expect(validateModel({ ...ok, ramGb: '257' }).errors.ramGb).toBeTruthy();
    expect(validateModel({ ...ok, ramGb: '0' }).errors.ramGb).toBeTruthy();
    expect(validateModel({ ...ok, storageGb: '8193' }).errors.storageGb).toBeTruthy();
    expect(validateModel({ ...ok, screenInch: '9.9' }).errors.screenInch).toBeTruthy();
    expect(validateModel({ ...ok, screenInch: '18' }).valid).toBe(true);
  });

  it('A-08 ตั้งค่าผิดช่วงตัวเดียวก็ไม่ผ่าน', () => {
    const ok = { maxLoanHours: '12', reservationMaxDaysAhead: '7', reservationGraceMinutes: '30', reminderBeforeMinutes: '30', maxActiveLoansPerUser: '1' };
    expect(validateSettings(ok).valid).toBe(true);
    const r = validateSettings({ ...ok, maxLoanHours: '25' });
    expect(r.valid).toBe(false);
    expect(Object.keys(r.errors)).toEqual(['maxLoanHours']);
    expect(validateSettings({ ...ok, maxActiveLoansPerUser: '6' }).valid).toBe(false);
    expect(validateSettings({ ...ok, reservationGraceMinutes: '4' }).valid).toBe(false);
  });

  it('รูปภาพ: jpg/png/webp ≤ 2 MB', () => {
    expect(validateImage({ type: 'image/png', size: 2 * 1024 * 1024 }).valid).toBe(true);
    expect(validateImage({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }).valid).toBe(false);
    expect(validateImage({ type: 'image/gif', size: 100 }).valid).toBe(false);
    expect(validateImage(null).valid).toBe(false);
  });
});
