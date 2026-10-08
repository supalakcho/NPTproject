// ถามยืนยันก่อนทำรายการ; ถ้าส่ง reason มาจะบังคับกรอกเหตุผล (ปุ่มยืนยันกดไม่ได้จนกว่าจะกรอก)
import { h } from '../core/dom.js';
import { openModal } from './modal.js';

/**
 * @param {{ title: string, message?: string, confirmLabel: string, cancelLabel?: string, danger?: boolean,
 *   details?: Node, reason?: { label: string, required?: boolean, value?: string } }} opts
 * @returns {Promise<boolean | string | null>} ไม่มี reason -> true/false · มี reason -> ข้อความเหตุผล (หรือ '' ถ้าไม่บังคับ) / null เมื่อยกเลิก
 */
export function confirmDialog({ title, message, confirmLabel, cancelLabel = 'ยกเลิก', danger = false, reason, details }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const input = reason ? h('textarea', { rows: 3, id: 'confirm-reason', 'aria-label': reason.label }, reason.value ?? '') : null;
    const content = h('div', null,
      message && h('p', null, message),
      details,
      reason && h('div', { class: 'field' }, h('label', { for: 'confirm-reason' }, reason.label), input));

    const modal = openModal({
      title,
      content,
      onClose: () => finish(reason ? null : false),
      actions: [
        { label: cancelLabel, onClick: (m) => m.close() },
        {
          label: confirmLabel,
          variant: danger ? 'danger' : 'primary',
          disabled: !!reason?.required && !reason.value?.trim(),
          onClick: (m) => {
            finish(reason ? input.value.trim() : true);
            m.close();
          },
        },
      ],
    });

    if (reason?.required) {
      const confirmBtn = modal.buttons[1];
      input.addEventListener('input', () => { confirmBtn.disabled = input.value.trim().length === 0; });
    }
  });
}
