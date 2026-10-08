// ตัวนับถอยหลังคำนวณจาก dueAt ฝั่ง client อัปเดตทุก 30 วินาที
import { COUNTDOWN_INTERVAL_MS, DUE_SOON_MINUTES } from '../config.js';
import { nowMs } from '../core/clock.js';
import { formatDuration, toMs } from '../utils/datetime.js';

/**
 * @returns {{ state: 'normal'|'soon'|'overdue', tone: 'ink'|'hold'|'alert', remainingMs: number, label: string }}
 */
export function computeCountdown(dueAt, now, dueSoonMinutes = DUE_SOON_MINUTES) {
  const remainingMs = toMs(dueAt) - toMs(now);
  const text = formatDuration(remainingMs);
  if (remainingMs < 0) return { state: 'overdue', tone: 'alert', remainingMs, label: `เกินกำหนด ${text}` };
  if (remainingMs <= dueSoonMinutes * 60_000) return { state: 'soon', tone: 'hold', remainingMs, label: `เหลืออีก ${text} ต้องคืนแล้ว` };
  return { state: 'normal', tone: 'ink', remainingMs, label: `เหลือเวลาอีก ${text}` };
}

/**
 * เรียก onTick ทันทีและซ้ำทุก intervalMs
 * @returns {{ stop: () => void, setDueAt: (iso: string) => void }}
 */
export function startCountdown({ dueAt, onTick, now = nowMs, intervalMs = COUNTDOWN_INTERVAL_MS }) {
  let due = dueAt;
  const tick = () => onTick(computeCountdown(due, now()));
  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    stop: () => clearInterval(timer),
    setDueAt: (iso) => { due = iso; tick(); },
  };
}
