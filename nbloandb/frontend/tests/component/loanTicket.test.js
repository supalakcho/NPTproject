import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeCountdown } from '../../assets/js/components/countdown.js';
import { loanTicket } from '../../assets/js/components/loanTicket.js';

const NOW = Date.parse('2026-10-08T16:30:00+07:00');
const MIN = 60_000;
const iso = (ms) => new Date(ms).toISOString();

const makeLoan = (over = {}) => ({
  id: 1, assetCode: 'NB-2025-0003', modelName: 'ThinkPad E14', loanStatus: 'borrowing',
  dueAt: iso(NOW + 61 * MIN),
  actions: { canExtend: true, maxExtendDueAt: iso(NOW + 5 * 60 * MIN), canRequestReturn: true },
  ...over,
});

const buttonLabels = (el) => [...el.querySelectorAll('button')].map((b) => b.textContent);

beforeEach(() => {
  localStorage.clear(); // mockClock ว่าง -> ใช้ Date.now ที่ fake timer คุมอยู่
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeCountdown', () => {
  const due = iso(NOW + 165 * MIN);

  it('เหลือมากกว่า 60 นาที -> normal/ink', () => {
    expect(computeCountdown(due, NOW)).toMatchObject({ state: 'normal', tone: 'ink', label: 'เหลือเวลาอีก 2 ชม. 45 นาที' });
  });

  it('เหลือ 60 นาทีพอดี -> soon/hold (ค่าขอบ)', () => {
    expect(computeCountdown(iso(NOW + 60 * MIN), NOW).state).toBe('soon');
    expect(computeCountdown(iso(NOW + 60 * MIN + 1), NOW).state).toBe('normal');
  });

  it('ใกล้ครบกำหนด -> ข้อความ "ต้องคืนแล้ว"', () => {
    expect(computeCountdown(iso(NOW + 40 * MIN), NOW).label).toBe('เหลืออีก 40 นาที ต้องคืนแล้ว');
  });

  it('เลยกำหนด -> overdue/alert', () => {
    expect(computeCountdown(iso(NOW - 25 * MIN), NOW)).toMatchObject({ state: 'overdue', tone: 'alert', label: 'เกินกำหนด 25 นาที' });
  });

  it('เหลือ 0 พอดียังไม่ถือว่าเกินกำหนด', () => {
    expect(computeCountdown(iso(NOW), NOW).state).toBe('soon');
  });

  it('ใช้ค่าคงที่ DUE_SOON ที่ส่งเข้าไปได้', () => {
    expect(computeCountdown(iso(NOW + 30 * MIN), NOW, 15).state).toBe('normal');
  });
});

describe('loanTicket', () => {
  it('แสดงรหัสเครื่อง กำหนดคืนเวลาไทย และปุ่มต่อเวลา/คืนเครื่อง', () => {
    const t = loanTicket({ loan: makeLoan() });
    expect(t.el.textContent).toContain('NB-2025-0003 ThinkPad E14');
    expect(t.el.textContent).toContain('กำหนดคืน 8 ต.ค. 2569 17:31 น.');
    expect(buttonLabels(t.el)).toEqual(['ต่อเวลา', 'คืนเครื่อง']);
    t.stop();
  });

  it('C-01 เหลือ 61 นาที แล้วเลื่อนเวลา 2 นาที -> สี ink เป็น hold', () => {
    const t = loanTicket({ loan: makeLoan() });
    expect(t.el.dataset.tone).toBe('ink');
    vi.advanceTimersByTime(2 * MIN);
    expect(t.el.dataset.tone).toBe('hold');
    expect(t.el.querySelector('.ticket-time').textContent).toBe('เหลืออีก 59 นาที ต้องคืนแล้ว');
    t.stop();
  });

  it('C-02 เลยกำหนด -> alert, "เกินกำหนด", ไม่มีปุ่มต่อเวลา', () => {
    const t = loanTicket({ loan: makeLoan({ dueAt: iso(NOW + 30 * 1000), loanStatus: 'borrowing' }) });
    expect(buttonLabels(t.el)).toContain('ต่อเวลา');
    vi.advanceTimersByTime(MIN);
    expect(t.el.dataset.tone).toBe('alert');
    expect(t.el.querySelector('.ticket-time').textContent).toMatch(/^เกินกำหนด/);
    expect(buttonLabels(t.el)).toEqual(['คืนเครื่อง']);
    t.stop();
  });

  it('server ตอบ overdue ตั้งแต่ต้น -> ไม่มีปุ่มต่อเวลา', () => {
    const t = loanTicket({ loan: makeLoan({ loanStatus: 'overdue', dueAt: iso(NOW - 25 * MIN) }) });
    expect(t.el.dataset.tone).toBe('alert');
    expect(buttonLabels(t.el)).toEqual(['คืนเครื่อง']);
    t.stop();
  });

  it('R-01 return_pending -> muted ข้อความรอยืนยัน ไม่มีปุ่มใดเหลือ', () => {
    const t = loanTicket({ loan: makeLoan({ loanStatus: 'return_pending' }) });
    expect(t.el.dataset.tone).toBe('muted');
    expect(t.el.querySelector('.ticket-time').textContent).toBe('คืนแล้ว รอผู้ดูแลยืนยันรับคืน');
    expect(buttonLabels(t.el)).toEqual([]);
    t.stop();
  });

  it('ซ่อนปุ่มต่อเวลาเมื่อ actions.canExtend = false', () => {
    const t = loanTicket({ loan: makeLoan({ actions: { canExtend: false, canRequestReturn: true } }) });
    expect(buttonLabels(t.el)).toEqual(['คืนเครื่อง']);
    t.stop();
  });

  it('กดปุ่มเรียก callback พร้อม loan', () => {
    const onExtend = vi.fn();
    const onReturn = vi.fn();
    const loan = makeLoan();
    const t = loanTicket({ loan, onExtend, onReturn });
    const [extend, ret] = t.el.querySelectorAll('button');
    extend.click();
    ret.click();
    expect(onExtend).toHaveBeenCalledWith(loan);
    expect(onReturn).toHaveBeenCalledWith(loan);
    t.stop();
  });

  it('E-01 update(loan ใหม่) -> กำหนดคืนบนบัตรอัปเดต', () => {
    const t = loanTicket({ loan: makeLoan() });
    t.update(makeLoan({ dueAt: iso(NOW + 5 * 60 * MIN) }));
    expect(t.el.textContent).toContain('กำหนดคืน 8 ต.ค. 2569 21:30 น.');
    expect(t.el.querySelector('.ticket-time').textContent).toBe('เหลือเวลาอีก 5 ชม. 0 นาที');
    t.stop();
  });

  it('ประกาศ aria-live เฉพาะเมื่อสถานะเปลี่ยน ไม่ประกาศทุกนาที', () => {
    const t = loanTicket({ loan: makeLoan({ dueAt: iso(NOW + 5 * 60 * MIN) }) });
    const live = t.el.querySelector('[aria-live="polite"]');
    expect(live.textContent).toBe('');
    vi.advanceTimersByTime(10 * MIN); // เวลาลดลงแต่สถานะยังเป็น normal
    expect(live.textContent).toBe('');
    vi.advanceTimersByTime(4 * 60 * MIN); // ข้ามเข้า soon
    expect(live.textContent).toMatch(/ต้องคืนแล้ว/);
    t.stop();
  });

  it('stop() หยุดตัวนับ', () => {
    const t = loanTicket({ loan: makeLoan() });
    t.stop();
    vi.advanceTimersByTime(5 * MIN);
    expect(t.el.dataset.tone).toBe('ink');
  });
});
