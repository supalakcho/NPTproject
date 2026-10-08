// หน้าแรกสมาชิก: บัตรยืม + การจองที่กำลังจะถึง
import { appUrl } from '../config.js';
import * as api from '../core/api.js';
import { h, loadView, runExclusive } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { dateTimeField, getIsoValue, setIsoValue } from '../components/dateTimeRange.js';
import { showErrors } from '../components/fieldError.js';
import { loanTicket } from '../components/loanTicket.js';
import { openModal } from '../components/modal.js';
import { statusBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { formatDateTime, formatTime, toMs } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { validateExtend } from '../utils/validate.js';

const main = await startPage({ role: 'member', active: 'home' });
const HOUR = 3600_000;
let tickets = [];

async function loadData() {
  const statuses = ['borrowing', 'overdue', 'return_pending'];
  const lists = await Promise.all(statuses.map((status) => api.listMyLoans({ status, pageSize: 50 })));
  // L2 ให้ `actions` (canExtend, maxExtendDueAt) ที่ M5 ไม่มี
  const loans = await Promise.all(lists.flatMap((r) => r.data).map((l) => api.getLoan(l.id).then((r) => r.data)));
  const [active, upcoming] = await Promise.all(['active', 'upcoming']
    .map((status) => api.listMyReservations({ status, sort: 'startAt:asc', pageSize: 50 })));
  return { loans, reservations: [...active.data, ...upcoming.data] };
}

const refresh = () => loadView(main, loadData, render);

function openExtend(loan, ticket) {
  const max = loan.actions.maxExtendDueAt;
  const suggested = Math.min(toMs(loan.dueAt) + HOUR, toMs(max));
  const body = h('div', null,
    h('p', null, `กำหนดคืนเดิม ${formatDateTime(loan.dueAt)}`),
    dateTimeField({
      name: 'newDueAt', label: 'เวลาคืนใหม่', min: loan.dueAt, max, value: new Date(suggested).toISOString(),
      hint: `ต่อได้ไม่เกิน ${formatDateTime(max)}`,
    }));

  openModal({
    title: `ต่อเวลา ${loan.assetCode}`,
    content: body,
    actions: [
      { label: 'ยกเลิก', onClick: (m) => m.close() },
      {
        label: 'ยืนยันต่อเวลา',
        variant: 'primary',
        onClick: async (m) => {
          const newDueAt = getIsoValue(body, 'newDueAt');
          const { valid, errors } = validateExtend({ newDueAt }, { dueAt: loan.dueAt, maxExtendDueAt: max });
          if (!valid) {
            showErrors(body, errors);
            return;
          }
          await runExclusive(m.buttons[1], async () => {
            try {
              const { data } = await api.extendLoan(loan.id, { newDueAt });
              m.close();
              showToast('ต่อเวลาแล้ว');
              ticket.update(data);
            } catch (err) {
              presentError(err, {
                form: body,
                onSetValue: (iso) => setIsoValue(body, 'newDueAt', iso),
                onReload: () => { m.close(); refresh(); },
              });
            }
          }, 'กำลังต่อเวลา...');
        },
      },
    ],
  });
}

async function returnLoan(loan, ticket) {
  const ok = await confirmDialog({
    title: 'คืนเครื่อง',
    message: `ยืนยันคืนเครื่อง ${loan.assetCode} ใช่หรือไม่ หลังจากนี้ผู้ดูแลจะยืนยันรับคืน`,
    confirmLabel: 'คืนเครื่อง',
  });
  if (!ok) return;
  try {
    const { data } = await api.requestReturn(loan.id);
    showToast('คืนเครื่องแล้ว รอผู้ดูแลยืนยันรับคืน');
    ticket.update(data);
  } catch (err) {
    presentError(err, { onReload: refresh });
  }
}

async function pickup(reservation, button) {
  await runExclusive(button, async () => {
    try {
      await api.pickupReservation(reservation.id);
      showToast('รับเครื่องแล้ว');
    } catch (err) {
      presentError(err);
    }
    await refresh(); // ไม่ว่าสำเร็จหรือไม่ สถานะการจองอาจเปลี่ยนไปแล้ว
  }, 'กำลังรับเครื่อง...');
}

async function cancelReservation(reservation) {
  const ok = await confirmDialog({
    title: 'ยกเลิกการจอง',
    message: `ยกเลิกการจอง ${reservation.assetCode} วันที่ ${formatDateTime(reservation.startAt)} ใช่หรือไม่`,
    confirmLabel: 'ยกเลิกการจอง',
    cancelLabel: 'ไม่ยกเลิก',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.cancelReservation(reservation.id);
    showToast('ยกเลิกการจองแล้ว');
  } catch (err) {
    presentError(err);
  }
  await refresh();
}

function reservationRow(r) {
  const isActive = r.status === 'active';
  return h('li', { class: 'list-row', dataset: { reservationId: r.id } },
    h('div', { class: 'row-main' },
      h('p', null, h('strong', null, r.assetCode), ` ${r.modelName} `, statusBadge('reservation', r.status)),
      h('p', null, `${formatDateTime(r.startAt)} – ${formatTime(r.endAt)}`),
      isActive && h('p', { class: 'muted' }, `รับเครื่องได้ถึง ${formatTime(r.pickupDeadline)}`)),
    h('div', { class: 'btn-row' },
      isActive && h('button', { class: 'btn btn-primary', type: 'button', onClick: (e) => pickup(r, e.currentTarget) }, 'รับเครื่อง'),
      h('button', { class: 'btn', type: 'button', onClick: () => cancelReservation(r) }, 'ยกเลิกจอง')));
}

function render({ loans, reservations }) {
  tickets.forEach((t) => t.stop());
  tickets = loans.map((loan) => {
    const ticket = loanTicket({ loan, onExtend: (l) => openExtend(l, ticket), onReturn: (l) => returnLoan(l, ticket) });
    return ticket;
  });

  return h('div', null,
    h('section', { class: 'section', 'aria-labelledby': 'h-loans' },
      h('h1', { id: 'h-loans' }, 'เครื่องที่คุณยืมอยู่'),
      tickets.length
        ? tickets.map((t) => t.el)
        : h('div', { class: 'empty-state' },
          h('p', null, 'ตอนนี้คุณไม่ได้ยืมเครื่องไหนอยู่'),
          h('a', { class: 'btn btn-primary', href: appUrl('member/notebooks.html') }, 'ค้นหาเครื่องที่ว่าง'))),
    h('section', { class: 'section', 'aria-labelledby': 'h-res' },
      h('h2', { id: 'h-res' }, 'การจองที่กำลังจะถึง'),
      reservations.length
        ? h('ul', { class: 'list-plain' }, reservations.map(reservationRow))
        : h('p', { class: 'empty-state' }, 'ยังไม่มีการจองล่วงหน้า')));
}

await refresh();
