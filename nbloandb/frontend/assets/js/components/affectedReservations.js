// หลังแอดมินทำให้เครื่องเสียหาย/ซ่อมบำรุง (L7, N6) ถ้ามีการจองล่วงหน้าที่ได้รับผลกระทบ
// ให้ถามว่าจะยกเลิกการจองเหล่านั้นไหม แล้วเรียก R4 ทีละรายการพร้อมเหตุผล
import * as api from '../core/api.js';
import { h } from '../core/dom.js';
import { formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { confirmDialog } from './confirmDialog.js';
import { showToast } from './toast.js';

/**
 * @param {{ id: number, startAt: string, userFullName: string }[]} reservations warnings.affectedReservations
 * @returns {Promise<number>} จำนวนการจองที่ยกเลิกสำเร็จ
 */
export async function offerCancelReservations(reservations) {
  if (!reservations?.length) return 0;

  const list = h('ul', null, reservations.map((r) => h('li', null, `${r.userFullName} · เริ่ม ${formatDateTime(r.startAt)}`)));
  const reason = await confirmDialog({
    title: 'ยกเลิกการจองที่ได้รับผลกระทบ?',
    message: `เครื่องนี้มีการจองล่วงหน้า ${reservations.length} รายการ ต้องการยกเลิกหรือไม่`,
    confirmLabel: 'ยกเลิกการจองเหล่านี้',
    cancelLabel: 'ไม่ยกเลิก',
    danger: true,
    details: list,
    reason: { label: 'เหตุผลที่ยกเลิก (ผู้จองจะได้รับแจ้ง)', required: true, value: 'เครื่องไม่พร้อมให้ใช้งาน' },
  });
  if (!reason) return 0;

  let done = 0;
  for (const r of reservations) {
    try {
      await api.cancelReservation(r.id, { reason });
      done += 1;
    } catch (err) {
      presentError(err);
    }
  }
  if (done) showToast(`ยกเลิกการจองแล้ว ${done} รายการ`);
  return done;
}
