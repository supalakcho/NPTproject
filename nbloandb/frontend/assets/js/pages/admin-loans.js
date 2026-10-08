// รายการยืมทั้งหมด (L5, L2, L8): filter สถานะ/คืนช้า/ช่วงวันที่ · ยกเลิกต้องกรอกเหตุผล
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { filterForm } from '../components/filterForm.js';
import { createListView } from '../components/listView.js';
import { openModal } from '../components/modal.js';
import { lateBadge, statusBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { dayEndIso, dayStartIso, formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { cleanQuery, readQuery, writeQuery } from '../utils/query.js';
import { STATUS_OPTIONS } from '../utils/status.js';

const main = await startPage({ role: 'admin', permission: 'loan.view_all', active: 'loans' });
const query = readQuery();
const ALL = { value: '', label: 'ทั้งหมด' };
const cancellable = (l) => !['returned', 'cancelled'].includes(l.loanStatus);

async function showDetail(loan) {
  try {
    const { data: l } = await api.getLoan(loan.id);
    const row = (label, value) => [h('dt', null, label), h('dd', null, value ?? '-')];
    openModal({
      title: `รายการยืม #${l.id}`,
      content: h('dl', { class: 'dl' },
        row('เครื่อง', `${l.assetCode} ${l.modelName}`), row('ผู้ยืม', l.userFullName),
        row('ยืมเมื่อ', formatDateTime(l.borrowedAt)), row('กำหนดคืน', formatDateTime(l.dueAt)),
        row('กดคืนเมื่อ', l.returnRequestedAt && formatDateTime(l.returnRequestedAt)),
        row('รับคืนเมื่อ', l.returnedAt && formatDateTime(l.returnedAt)),
        row('สภาพเมื่อคืน', l.returnCondition && (l.returnCondition === 'damaged' ? 'เสียหาย' : 'ปกติ')),
        row('หมายเหตุ', l.returnNote), row('เหตุผลที่ยกเลิก', l.cancelReason),
        row('สถานะ', statusBadge('loan', l.loanStatus)), row('คืนช้า', l.isLate ? 'ใช่' : 'ไม่')),
      actions: [{ label: 'ปิด', onClick: (m) => m.close() }],
    });
  } catch (err) {
    presentError(err);
  }
}

async function cancel(loan) {
  const reason = await confirmDialog({
    title: 'ยกเลิกรายการยืม',
    message: `ยกเลิกรายการยืม ${loan.assetCode} ของ ${loan.userFullName} ผู้ยืมจะได้รับแจ้งเตือน`,
    confirmLabel: 'ยกเลิกรายการยืม', cancelLabel: 'ไม่ยกเลิก', danger: true,
    reason: { label: 'เหตุผลที่ยกเลิก', required: true },
  });
  if (!reason) return;
  try {
    await api.cancelLoan(loan.id, { reason });
    showToast('ยกเลิกรายการยืมแล้ว');
    list.reload();
  } catch (err) {
    presentError(err, { onReload: () => list.reload() });
  }
}

const list = createListView({
  caption: 'รายการยืมทั้งหมด',
  empty: 'ไม่พบรายการยืม',
  fetch: ({ from, to, ...q }) => api.listLoans({ ...q, from: dayStartIso(from), to: dayEndIso(to), pageSize: 20 }),
  onQueryChange: writeQuery,
  columns: [
    { key: 'id', header: '#', render: (l) => l.id },
    { key: 'user', header: 'ผู้ยืม', render: (l) => l.userFullName },
    { key: 'asset', header: 'เครื่อง', render: (l) => `${l.assetCode} ${l.modelName}` },
    { key: 'borrowedAt', header: 'ยืมเมื่อ', render: (l) => formatDateTime(l.borrowedAt) },
    { key: 'dueAt', header: 'กำหนดคืน', render: (l) => formatDateTime(l.dueAt) },
    { key: 'status', header: 'สถานะ', render: (l) => h('span', null, statusBadge('loan', l.loanStatus), l.isLate && [' ', lateBadge()]) },
    {
      key: 'actions', header: '',
      render: (l) => h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onClick: () => showDetail(l) }, 'รายละเอียด'),
        cancellable(l) && h('button', { class: 'btn btn-danger', type: 'button', onClick: () => cancel(l) }, 'ยกเลิก')),
    },
  ],
});

const form = filterForm({
  values: query,
  fields: [
    { name: 'status', label: 'สถานะ', as: 'select', options: [ALL, ...STATUS_OPTIONS('loan')] },
    { name: 'isLate', label: 'การคืนช้า', as: 'select', options: [ALL, { value: 'true', label: 'คืนช้า' }, { value: 'false', label: 'ไม่คืนช้า' }] },
    { name: 'from', label: 'ยืมตั้งแต่วันที่', type: 'date' },
    { name: 'to', label: 'ถึงวันที่', type: 'date' },
  ],
  onSubmit: (v) => list.setQuery(cleanQuery(v)),
});

replaceContent(main, h('div', { class: 'page-head' }, h('h1', null, 'รายการยืม')), form, list.el);
list.setQuery(cleanQuery(query));
