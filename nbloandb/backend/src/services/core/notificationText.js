// ข้อความแจ้งเตือนภาษาไทยตาม type (type ตาม ENUM ใน SQL)

const time = (d) =>
  d ? new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' }) + ' น.' : '-';

const TEMPLATES = {
  loan_due_soon: (n) => ['ใกล้ครบกำหนดคืน', `เครื่อง ${n.assetCode} ครบกำหนดคืนเวลา ${time(n.refDueAt)}`],
  loan_overdue: (n) => ['เกินกำหนดคืน', `เครื่อง ${n.assetCode} เกินกำหนดคืนแล้ว กรุณานำมาคืนโดยเร็ว`],
  reservation_starting: (n, { startAt, grace }) => [
    'ใกล้ถึงเวลาจอง',
    `การจองเครื่อง ${n.assetCode} จะเริ่มเวลา ${time(startAt)} มารับภายใน ${grace} นาที`,
  ],
  loan_cancelled: (n) => ['รายการยืมถูกยกเลิก', `รายการยืมเครื่อง ${n.assetCode} ถูกยกเลิกโดยผู้ดูแลระบบ`],
  reservation_cancelled: (n) => ['การจองถูกยกเลิก', `การจองเครื่อง ${n.assetCode} ถูกยกเลิกโดยผู้ดูแลระบบ`],
};

/**
 * @param {object} n notification จาก model
 * @param {{ startAt?: Date, grace?: number }} [extra] สำหรับ reservation_starting
 * @returns {{ title: string, message: string }}
 */
export function notificationText(n, extra = {}) {
  const [title, message] = TEMPLATES[n.type]?.(n, extra) ?? ['แจ้งเตือน', ''];
  return { title, message };
}
