import { describe, expect, it } from 'vitest';
import {
  bangkokAt, formatDateTime, formatDuration, isoToLocalInput, localInputToIso, toThaiIso,
} from '../../assets/js/utils/datetime.js';

describe('เวลาไทย (T-01)', () => {
  it('process ทดสอบตั้งเป็น UTC จริง (พิสูจน์ว่า test มีความหมาย)', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(0);
  });

  it('แสดงเวลาเป็น Asia/Bangkok ปี พ.ศ. แม้เครื่องเป็น UTC', () => {
    expect(formatDateTime('2026-10-08T09:30:00Z')).toBe('8 ต.ค. 2569 16:30 น.');
    expect(formatDateTime('2026-10-08T16:30:00+07:00')).toBe('8 ต.ค. 2569 16:30 น.');
  });

  it('ข้ามเที่ยงคืนตามเวลาไทย', () => {
    expect(formatDateTime('2026-10-08T17:30:00Z')).toBe('9 ต.ค. 2569 00:30 น.');
  });

  it('ค่าจาก datetime-local ถูกตีความเป็นเวลาไทย ไม่ใช่ timezone เครื่อง', () => {
    expect(localInputToIso('2026-10-08T14:30')).toBe('2026-10-08T14:30:00+07:00');
    expect(Date.parse(localInputToIso('2026-10-08T14:30'))).toBe(Date.parse('2026-10-08T07:30:00Z'));
  });

  it('ค่าว่างหรือรูปแบบผิดคืน null', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso(undefined)).toBeNull();
    expect(localInputToIso('2026-10-08')).toBeNull();
  });

  it('toThaiIso ให้ offset +07:00 เสมอ', () => {
    expect(toThaiIso(Date.parse('2026-10-08T07:30:00Z'))).toBe('2026-10-08T14:30:00+07:00');
    expect(toThaiIso('2026-10-08T07:30:00Z')).toBe('2026-10-08T14:30:00+07:00');
  });

  it('isoToLocalInput ย้อนกลับเป็นเวลาไทย', () => {
    expect(isoToLocalInput('2026-10-08T07:30:00Z')).toBe('2026-10-08T14:30');
  });

  it('bangkokAt สร้างเวลา hh:mm ของวันไทย (now + offset วัน)', () => {
    const now = Date.parse('2026-10-08T20:00:00Z'); // 9 ต.ค. 03:00 ไทย
    expect(toThaiIso(bangkokAt(now, 1, 9))).toBe('2026-10-10T09:00:00+07:00');
    expect(toThaiIso(bangkokAt(now, 0, 13, 30))).toBe('2026-10-09T13:30:00+07:00');
  });
});

describe('formatDuration', () => {
  it('ชั่วโมงและนาที', () => {
    expect(formatDuration(2 * 3600_000 + 45 * 60_000)).toBe('2 ชม. 45 นาที');
    expect(formatDuration(60 * 60_000)).toBe('1 ชม. 0 นาที');
  });

  it('เฉพาะนาที', () => {
    expect(formatDuration(25 * 60_000)).toBe('25 นาที');
  });

  it('ค่าติดลบใช้ค่าสัมบูรณ์ (ใช้กับ "เกินกำหนด")', () => {
    expect(formatDuration(-25 * 60_000)).toBe('25 นาที');
  });

  it('น้อยกว่า 1 นาที', () => {
    expect(formatDuration(30_000)).toBe('น้อยกว่า 1 นาที');
  });
});
