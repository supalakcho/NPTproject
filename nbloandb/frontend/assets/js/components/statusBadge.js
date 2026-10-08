// ป้ายสถานะ: มีข้อความกำกับเสมอ ไม่ใช้สีอย่างเดียว
import { h } from '../core/dom.js';
import { LATE_BADGE, statusInfo } from '../utils/status.js';

/** @param {'notebook'|'condition'|'loan'|'reservation'|'user'} kind */
export function statusBadge(kind, code) {
  const { label, tone } = statusInfo(kind, code);
  return h('span', { class: `badge badge-${tone}`, dataset: { status: code } }, label);
}

/** ป้าย "คืนช้า" ใช้เมื่อ loan.isLate */
export function lateBadge() {
  return h('span', { class: `badge badge-${LATE_BADGE.tone}`, dataset: { status: 'late' } }, LATE_BADGE.label);
}
