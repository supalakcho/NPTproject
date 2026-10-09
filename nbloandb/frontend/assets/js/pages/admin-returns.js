// หน้าแรกแอดมิน: คิว "รอยืนยันรับคืน" (L6) + สแกน/พิมพ์รหัสครุภัณฑ์ (N3) + ยืนยันรับคืน (L7)
import * as api from '../core/api.js';
import { nowMs } from '../core/clock.js';
import { h, loadView, replaceContent, runExclusive } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { offerCancelReservations } from '../components/affectedReservations.js';
import { barcodeInput } from '../components/barcodeInput.js';
import { dateTimeField, getIsoValue } from '../components/dateTimeRange.js';
import { createField, showErrors } from '../components/fieldError.js';
import { openModal } from '../components/modal.js';
import { lateBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { formatDateTime, formatDuration, toMs } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { validateConfirmReturn } from '../utils/validate.js';

const main = await startPage({ role: 'admin', permission: 'loan.receive', active: 'returns' });
const queue = h('div');
const countEl = h('p', { class: 'muted', 'aria-live': 'polite' });

/**
 * ฟอร์มยืนยันรับคืน (ใช้ทั้งในคิวและในหน้าต่างบันทึกรับคืนโดยตรง)
 * ปุ่มยืนยันกดไม่ได้จนกว่าจะเลือกสภาพ และถ้าเสียหายต้องมีหมายเหตุ 1–500 ตัว
 */
function returnForm(loan, { withTime = false, onDone }) {
  const prefix = `r${loan.id}-`;
  const radio = (value, label) => h('label', null,
    h('input', { type: 'radio', name: 'returnCondition', value }), label);
  const noteField = createField({ name: 'returnNote', label: 'หมายเหตุ (บังคับเมื่อเสียหาย)', as: 'textarea', idPrefix: prefix, attrs: { maxlength: 500, disabled: true } });
  const timeField = withTime
    ? dateTimeField({
      name: 'returnRequestedAt', label: 'เวลาที่เครื่องมาถึงจริง (ไม่ระบุ = ตอนนี้)', idPrefix: prefix,
      min: new Date(toMs(loan.borrowedAt)).toISOString(), max: new Date(nowMs()).toISOString(),
    })
    : null;
  const submit = h('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, 'ยืนยันรับคืน');

  const form = h('form', { novalidate: true, dataset: { loanId: loan.id } },
    h('fieldset', { class: 'field', style: 'border:0;padding:0;margin:0 0 16px' },
      h('legend', null, 'สภาพเครื่อง'),
      h('div', { class: 'radio-row' }, radio('normal', 'ปกติ'), radio('damaged', 'เสียหาย')),
      h('div', { class: 'field-error', role: 'alert', dataset: { errorFor: 'returnCondition' } })),
    noteField, timeField, submit);

  const read = () => ({
    returnCondition: form.querySelector('input[name="returnCondition"]:checked')?.value ?? '',
    returnNote: form.querySelector('[name="returnNote"]').value,
    returnRequestedAt: withTime ? getIsoValue(form, 'returnRequestedAt') : null,
  });

  function sync() {
    const v = read();
    form.querySelector('[name="returnNote"]').disabled = v.returnCondition !== 'damaged';
    submit.disabled = !validateConfirmReturn(v, { now: nowMs(), borrowedAt: loan.borrowedAt }).valid;
  }
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = read();
    const { valid, errors } = validateConfirmReturn(v, { now: nowMs(), borrowedAt: loan.borrowedAt });
    if (!valid) {
      showErrors(form, errors);
      return;
    }
    await runExclusive(submit, async () => {
      try {
        const { data } = await api.confirmReturn(loan.id, {
          returnCondition: v.returnCondition,
          returnNote: v.returnCondition === 'damaged' ? v.returnNote.trim() : null,
          returnRequestedAt: v.returnRequestedAt,
        });
        showToast(`รับคืนเครื่อง ${loan.assetCode} แล้ว`);
        await offerCancelReservations(data.warnings?.affectedReservations);
        onDone();
      } catch (err) {
        presentError(err, { form, onReload: onDone });
      }
    }, 'กำลังบันทึก...');
  });

  return form;
}

function card(loan) {
  const lateBy = toMs(loan.returnRequestedAt) - toMs(loan.dueAt);
  return h('article', { class: 'return-card', dataset: { loanId: loan.id }, 'aria-label': `รับคืน ${loan.assetCode}` },
    h('h2', null, `${loan.assetCode} `, h('span', { class: 'muted' }, loan.modelName)),
    h('p', null, `ผู้ยืม: ${loan.userFullName}`),
    h('p', null,
      `กดคืน ${formatDateTime(loan.returnRequestedAt)} `,
      loan.isLate && [lateBadge(), ` คืนช้า ${formatDuration(lateBy)}`]),
    returnForm(loan, { onDone: refresh }));
}

function refresh() {
  return loadView(queue, () => api.listPendingReturn({ pageSize: 100 }), ({ data }) => {
    countEl.textContent = `รอรับคืน ${data.length} เครื่อง`;
    return data.length
      ? h('div', null, data.map(card))
      : h('p', { class: 'empty-state' }, 'ไม่มีเครื่องที่รอยืนยันรับคืน');
  });
}

/** เลือกการ์ดของรายการนั้น เลื่อนมาให้เห็น และโฟกัสช่องแรกของฟอร์ม */
function selectCard(loanId) {
  for (const c of queue.querySelectorAll('.return-card')) c.classList.toggle('is-selected', Number(c.dataset.loanId) === loanId);
  const el = queue.querySelector(`.return-card[data-loan-id="${loanId}"]`);
  el?.scrollIntoView({ block: 'center' });
  el?.querySelector('input')?.focus();
  return !!el;
}

function openDirectReturn(loan) {
  const modal = openModal({
    title: `บันทึกรับคืน ${loan.assetCode}`,
    content: h('div', null,
      h('p', null, `ผู้ยืม: ${loan.userFullName} · กำหนดคืน ${formatDateTime(loan.dueAt)}`),
      h('p', { class: 'muted' }, 'สมาชิกยังไม่ได้กดคืนเครื่องนี้ ระบุเวลาที่เครื่องมาถึงจริงเพื่อคำนวณการคืนช้า'),
      returnForm(loan, { withTime: true, onDone: () => { modal.close(); refresh(); } })),
    actions: [{ label: 'ปิด', onClick: (m) => m.close() }],
  });
}

async function lookup(code, { fromModal } = {}) {
  try {
    const { data: nb } = await api.getNotebookByAsset(code);
    const loan = nb.activeLoan;
    if (!loan) {
      showToast(`เครื่อง ${nb.assetCode} ไม่มีรายการยืมค้างอยู่`);
      return;
    }
    fromModal?.close();
    if (loan.loanStatus === 'return_pending') {
      if (!selectCard(loan.id)) await refresh().then(() => selectCard(loan.id));
    } else {
      openDirectReturn(loan);
    }
  } catch (err) {
    presentError(err);
  }
}

function openDirectLookup() {
  const scanner = barcodeInput({ id: 'barcode-input-modal', label: 'รหัสครุภัณฑ์ของเครื่องที่นำมาคืน', onScan: (code) => lookup(code, { fromModal: modal }) });
  const modal = openModal({
    title: 'บันทึกรับคืนเครื่องที่ยังไม่กดคืน',
    content: scanner.el,
    actions: [{ label: 'ปิด', onClick: (m) => m.close() }],
  });
  scanner.focus();
}

const scanner = barcodeInput({ onScan: (code) => lookup(code) });

replaceContent(main,
  h('div', { class: 'page-head' }, h('h1', null, 'รอยืนยันรับคืน'), countEl),
  scanner.el,
  queue,
  h('div', { class: 'section' },
    h('button', { class: 'btn', type: 'button', onClick: openDirectLookup }, 'บันทึกรับคืนเครื่องที่ยังไม่กดคืน')));
await refresh();
scanner.focus();
