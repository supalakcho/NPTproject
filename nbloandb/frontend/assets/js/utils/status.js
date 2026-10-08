// สถานะ -> ข้อความไทย + token สี (ป้ายต้องมีข้อความเสมอ ห้ามใช้สีอย่างเดียว)
const NOTEBOOK = {
  available: { label: 'ว่าง', tone: 'ok' },
  borrowed: { label: 'ถูกยืม', tone: 'busy' },
  reserved: { label: 'ถูกจอง', tone: 'hold' },
  damaged: { label: 'เสียหาย', tone: 'alert' },
  maintenance: { label: 'ซ่อมบำรุง', tone: 'muted' },
  retired: { label: 'ปลดระวาง', tone: 'muted' },
};

const CONDITION = {
  normal: { label: 'ปกติ', tone: 'ok' },
  damaged: NOTEBOOK.damaged,
  maintenance: NOTEBOOK.maintenance,
  retired: NOTEBOOK.retired,
};

const LOAN = {
  borrowing: { label: 'กำลังยืม', tone: 'busy' },
  overdue: { label: 'เกินกำหนด', tone: 'alert' },
  return_pending: { label: 'รอยืนยันรับคืน', tone: 'muted' },
  returned: { label: 'คืนแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: 'muted' },
};

const RESERVATION = {
  upcoming: { label: 'รอใช้', tone: 'hold' },
  active: { label: 'ถึงเวลาใช้', tone: 'busy' },
  fulfilled: { label: 'รับเครื่องแล้ว', tone: 'ok' },
  expired: { label: 'หมดอายุ', tone: 'muted' },
  cancelled: { label: 'ยกเลิก', tone: 'muted' },
};

const USER = {
  active: { label: 'ใช้งานอยู่', tone: 'ok' },
  suspended: { label: 'ถูกระงับ', tone: 'alert' },
  deleted: { label: 'ลบแล้ว', tone: 'muted' },
};

export const LATE_BADGE = { label: 'คืนช้า', tone: 'alert' };

const MAPS = { notebook: NOTEBOOK, condition: CONDITION, loan: LOAN, reservation: RESERVATION, user: USER };

/** @param {'notebook'|'condition'|'loan'|'reservation'|'user'} kind */
export function statusInfo(kind, code) {
  return MAPS[kind]?.[code] ?? { label: String(code ?? '-'), tone: 'muted' };
}

export const STATUS_OPTIONS = (kind) => Object.entries(MAPS[kind]).map(([value, { label }]) => ({ value, label }));
