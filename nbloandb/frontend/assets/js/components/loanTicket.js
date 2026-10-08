// บัตรยืม: จุดเด่นจุดเดียวของระบบ แสดงเวลาที่เหลือก่อนต้องคืน เปลี่ยนสีตามความเร่งด่วน
import { h } from '../core/dom.js';
import { nowMs } from '../core/clock.js';
import { formatDateTime } from '../utils/datetime.js';
import { startCountdown } from './countdown.js';

// เงื่อนไข -> สีของบัตร (ตามตารางใน prompt ข้อ 4)
const TONE = { normal: 'ink', soon: 'hold', overdue: 'alert', pending: 'muted' };

/**
 * @param {{ loan: object, now?: () => number, onExtend?: (loan: object) => void, onReturn?: (loan: object) => void }} opts
 * loan ต้องมี `actions` (จาก GET /loans/:id)
 * @returns {{ el: HTMLElement, update: (loan: object) => void, stop: () => void }}
 */
export function loanTicket({ loan: initial, now = nowMs, onExtend, onReturn }) {
  let loan = initial;
  let state = null;

  const asset = h('p', { class: 'ticket-asset' });
  const time = h('p', { class: 'ticket-time' });
  const due = h('p', { class: 'ticket-due' });
  const actions = h('div', { class: 'btn-row' });
  // ประกาศเฉพาะเมื่อสถานะเปลี่ยน ไม่ประกาศทุกนาที
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const el = h('article', { class: 'loan-ticket', dataset: { loanId: loan.id } }, asset, time, due, actions, live);

  function renderActions(next) {
    actions.replaceChildren();
    if (next === 'pending') return;
    if (next !== 'overdue' && loan.actions?.canExtend) {
      actions.append(h('button', { class: 'btn', type: 'button', onClick: () => onExtend?.(loan) }, 'ต่อเวลา'));
    }
    if (loan.actions?.canRequestReturn !== false) {
      actions.append(h('button', { class: 'btn btn-primary', type: 'button', onClick: () => onReturn?.(loan) }, 'คืนเครื่อง'));
    }
  }

  function paint({ state: cdState, label }) {
    const next = loan.loanStatus === 'return_pending' ? 'pending'
      : loan.loanStatus === 'overdue' ? 'overdue' : cdState;
    const text = next === 'pending' ? 'คืนแล้ว รอผู้ดูแลยืนยันรับคืน' : label;

    time.textContent = text;
    if (next !== state) {
      const first = state === null;
      state = next;
      el.dataset.tone = TONE[next];
      el.dataset.state = next;
      renderActions(next);
      if (!first) live.textContent = text;
    }
  }

  asset.textContent = `${loan.assetCode} ${loan.modelName}`;
  due.textContent = `กำหนดคืน ${formatDateTime(loan.dueAt)}`;

  const counter = startCountdown({ dueAt: loan.dueAt, now, onTick: paint });

  return {
    el,
    stop: counter.stop,
    update(next) {
      loan = next;
      state = null; // บังคับวาดปุ่มใหม่ตามข้อมูลล่าสุด
      asset.textContent = `${loan.assetCode} ${loan.modelName}`;
      due.textContent = `กำหนดคืน ${formatDateTime(loan.dueAt)}`;
      counter.setDueAt(loan.dueAt);
    },
  };
}
