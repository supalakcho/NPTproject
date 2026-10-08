import { describe, expect, it } from 'vitest';
import { ApiError, classifyError } from '../../assets/js/utils/errors.js';

const err = (code, details, message = 'ข้อความจาก backend') => new ApiError({ status: 409, code, message, details });

describe('classifyError', () => {
  it('ค่าเริ่มต้นแสดง error.message จาก backend', () => {
    expect(classifyError(err('SOMETHING_ELSE')).message).toBe('ข้อความจาก backend');
  });

  it('UNAUTHORIZED / ACCOUNT_SUSPENDED จบ session', () => {
    expect(classifyError(err('UNAUTHORIZED')).sessionEnd).toBe(true);
    expect(classifyError(err('ACCOUNT_SUSPENDED')).sessionEnd).toBe(true);
  });

  it('VALIDATION_ERROR วางตาม details[].field', () => {
    const c = classifyError(err('VALIDATION_ERROR', [{ field: 'dueAt', message: 'ผิด' }, { field: 'phone', message: 'ผิดเบอร์' }]));
    expect(c.fieldErrors).toEqual({ dueAt: 'ผิด', phone: 'ผิดเบอร์' });
  });

  it('OWN_RESERVATION_OVERLAP มีปุ่มไปที่การจองของฉัน', () => {
    const c = classifyError(err('OWN_RESERVATION_OVERLAP', { reservationId: 3 }));
    expect(c.action).toEqual({ type: 'link', label: 'ไปที่การจองของฉัน', href: 'member/home.html' });
  });

  it('RESERVATION_CONFLICT แสดงเวลาที่ยืมได้ถึงและตั้งค่าได้ (B-03)', () => {
    const c = classifyError(err('RESERVATION_CONFLICT', { availableUntil: '2026-10-09T09:00:00+07:00' }));
    expect(c.extra).toBe('ยืมได้ถึง 9 ต.ค. 2569 09:00 น.');
    expect(c.action).toMatchObject({ type: 'setValue', value: '2026-10-09T09:00:00+07:00' });
  });

  it('RESERVATION_CONFLICT จาก R1 (ไม่มี details) ไม่มีปุ่มตั้งเวลา', () => {
    expect(classifyError(err('RESERVATION_CONFLICT')).action).toBeUndefined();
  });

  it('EXTEND_CONFLICT_RESERVATION / LOAN_DURATION_EXCEEDED แสดง maxDueAt (E-02)', () => {
    for (const code of ['EXTEND_CONFLICT_RESERVATION', 'LOAN_DURATION_EXCEEDED']) {
      const c = classifyError(err(code, { maxDueAt: '2026-10-08T21:00:00+07:00' }));
      expect(c.extra).toBe('ต่อได้ถึง 8 ต.ค. 2569 21:00 น.');
      expect(c.action.value).toBe('2026-10-08T21:00:00+07:00');
    }
  });

  it('LOAN_LIMIT_REACHED มีปุ่มไปที่เครื่องที่ยืมอยู่', () => {
    expect(classifyError(err('LOAN_LIMIT_REACHED')).action.label).toBe('ไปที่เครื่องที่ยืมอยู่');
  });

  it('รหัสที่ต้องโหลดข้อมูลหน้าใหม่ (B-04)', () => {
    for (const code of ['NOTEBOOK_ALREADY_BORROWED', 'NOTEBOOK_NOT_AVAILABLE', 'LOAN_STATE_CHANGED', 'RETURN_ALREADY_REQUESTED', 'LOAN_ALREADY_RETURNED']) {
      expect(classifyError(err(code)).reload).toBe(true);
    }
  });

  it('ข้อความพร้อมตัวเลขจาก details (A-05)', () => {
    expect(classifyError(err('NOTEBOOK_HAS_COMMITMENTS', { activeLoans: 1, upcomingReservations: 2 })).extra)
      .toBe('กำลังยืม 1 รายการ · การจองล่วงหน้า 2 รายการ');
    expect(classifyError(err('BRAND_IN_USE', { activeModels: 4 })).extra).toBe('มีรุ่นที่ใช้ยี่ห้อนี้ 4 รุ่น');
    expect(classifyError(err('MODEL_IN_USE', { activeNotebooks: 3 })).extra).toBe('มีเครื่องที่ใช้รุ่นนี้ 3 เครื่อง');
  });

  it('NETWORK_ERROR / INTERNAL_ERROR มีปุ่มลองใหม่', () => {
    expect(classifyError(err('NETWORK_ERROR')).retry).toBe(true);
    expect(classifyError(err('INTERNAL_ERROR')).retry).toBe(true);
  });

  it('error ที่ไม่ใช่ ApiError ถือเป็น INTERNAL_ERROR', () => {
    expect(classifyError(new Error('boom')).retry).toBe(true);
  });
});
