// เวลาทั้งหมดในระบบเป็นเวลาไทย (UTC+7) ไม่ขึ้นกับ timezone ของเครื่องผู้ใช้
const TZ = 'Asia/Bangkok';
const OFFSET_MS = 7 * 3600 * 1000;

/** รับ Date | ms | ISO string แล้วคืน ms */
export function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value);
}

/** คืน ISO แบบเวลาไทย เช่น 2026-10-08T14:30:00+07:00 */
export function toThaiIso(value) {
  return new Date(toMs(value) + OFFSET_MS).toISOString().slice(0, 19) + '+07:00';
}

/** ค่าจาก <input type="datetime-local"> (YYYY-MM-DDTHH:mm) -> ISO +07:00 เสมอ ไม่ใช้ timezone เครื่อง */
export function localInputToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) return null;
  return `${value}:00+07:00`;
}

/** ISO/Date -> ค่าสำหรับ <input type="datetime-local"> (เวลาไทย) */
export function isoToLocalInput(value) {
  return toThaiIso(value).slice(0, 16);
}

const dateFmt = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function formatDate(value) {
  return dateFmt.format(toMs(value));
}

export function formatTime(value) {
  return timeFmt.format(toMs(value)) + ' น.';
}

/** เช่น 8 ต.ค. 2569 16:30 น. (ปี พ.ศ.) */
export function formatDateTime(value) {
  if (!value) return '-';
  return `${formatDate(value)} ${formatTime(value)}`;
}

/** ระยะเวลาเป็นข้อความไทย เช่น "2 ชม. 45 นาที" / "12 นาที" / "น้อยกว่า 1 นาที" */
export function formatDuration(ms) {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  if (totalMin < 1) return 'น้อยกว่า 1 นาที';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

/** วัน 00:00-23:59 ตามเวลาไทย ของวันที่ (now + dayOffset) ที่ hh:mm — ใช้ใน mock */
export function bangkokAt(now, dayOffset, hh, mm = 0) {
  const shifted = new Date(toMs(now) + OFFSET_MS);
  const base = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + dayOffset, hh, mm);
  return base - OFFSET_MS;
}

/** วันที่จาก <input type="date"> (YYYY-MM-DD) -> ต้นวัน/สิ้นวันตามเวลาไทย ใช้กับ filter from/to */
export const dayStartIso = (date) => (date ? `${date}T00:00:00+07:00` : undefined);
export const dayEndIso = (date) => (date ? `${date}T23:59:59+07:00` : undefined);

/** เดือนปัจจุบัน (เวลาไทย) รูปแบบ YYYY-MM บวก/ลบด้วย offset เดือน */
export function monthOf(now, offset = 0) {
  const [y, m] = toThaiIso(now).slice(0, 7).split('-').map(Number);
  const idx = y * 12 + (m - 1) + offset;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
