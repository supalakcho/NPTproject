import { describe, expect, it } from 'vitest';
import { LATE_BADGE, statusInfo } from '../../assets/js/utils/status.js';

describe('status map', () => {
  it('ทุกสถานะเครื่องมีข้อความไทยกำกับ', () => {
    const labels = ['available', 'borrowed', 'reserved', 'damaged', 'maintenance', 'retired'].map((c) => statusInfo('notebook', c).label);
    expect(labels).toEqual(['ว่าง', 'ถูกยืม', 'ถูกจอง', 'เสียหาย', 'ซ่อมบำรุง', 'ปลดระวาง']);
  });

  it('สถานะการยืมและการจอง', () => {
    expect(statusInfo('loan', 'return_pending')).toEqual({ label: 'รอยืนยันรับคืน', tone: 'muted' });
    expect(statusInfo('loan', 'overdue').tone).toBe('alert');
    expect(statusInfo('reservation', 'active').label).toBe('ถึงเวลาใช้');
    expect(statusInfo('reservation', 'cancelled').label).toBe('ยกเลิก');
    expect(statusInfo('condition', 'normal').label).toBe('ปกติ');
  });

  it('สีตาม token ใน prompt', () => {
    expect(statusInfo('notebook', 'available').tone).toBe('ok');
    expect(statusInfo('notebook', 'borrowed').tone).toBe('busy');
    expect(statusInfo('notebook', 'reserved').tone).toBe('hold');
    expect(statusInfo('notebook', 'damaged').tone).toBe('alert');
    expect(statusInfo('notebook', 'maintenance').tone).toBe('muted');
  });

  it('สถานะที่ไม่รู้จักยังมีข้อความ (ไม่ใช้สีอย่างเดียว)', () => {
    expect(statusInfo('loan', 'weird').label).toBe('weird');
  });

  it('ป้ายคืนช้า', () => {
    expect(LATE_BADGE.label).toBe('คืนช้า');
  });
});
