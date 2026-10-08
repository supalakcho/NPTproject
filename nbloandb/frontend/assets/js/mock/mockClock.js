// นาฬิกาของ mock: เลื่อนได้จาก test หรือ ?mockNow=2026-10-08T16:30:00+07:00
// เก็บใน localStorage เพื่อให้ค่าเดียวกันตลอดทุกหน้า (MPA)
import { MOCK_CLOCK_KEY } from '../config.js';

function read() {
  try {
    return JSON.parse(localStorage.getItem(MOCK_CLOCK_KEY));
  } catch {
    return null;
  }
}

function write(state) {
  try {
    if (state) localStorage.setItem(MOCK_CLOCK_KEY, JSON.stringify(state));
    else localStorage.removeItem(MOCK_CLOCK_KEY);
  } catch {
    /* storage ใช้ไม่ได้ ใช้เวลาจริงต่อไป */
  }
}

export function now() {
  const s = read();
  if (!s) return Date.now();
  return s.frozen ? s.base : s.base + (Date.now() - s.realAt);
}

/** ตั้งเวลาปัจจุบันของ mock (เวลาเดินต่อ เว้นแต่ freeze = true) */
export function set(value, { freeze = false } = {}) {
  const base = typeof value === 'number' ? value : Date.parse(value);
  if (Number.isNaN(base)) return;
  write({ base, realAt: Date.now(), frozen: freeze });
}

export function advance(ms) {
  const s = read();
  set(now() + ms, { freeze: s?.frozen ?? false });
}

export function reset() {
  write(null);
}

/** เรียกครั้งเดียวตอนโหลดหน้า: ?mockNow=... */
export function initFromUrl(search = globalThis.location?.search ?? '') {
  const value = new URLSearchParams(search).get('mockNow');
  if (value) set(value);
}
