// รายการจองทั้งหมด (R5, R4): filter สถานะ/ช่วงวันที่ · ยกเลิกต้องกรอกเหตุผล
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { filterForm } from '../components/filterForm.js';
import { createListView } from '../components/listView.js';
import { statusBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { dayEndIso, dayStartIso, formatDateTime, formatTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { cleanQuery, readQuery, writeQuery } from '../utils/query.js';
import { STATUS_OPTIONS } from '../utils/status.js';

const main = await startPage({ role: 'admin', permission: 'reservation.view_all', active: 'reservations' });
const query = readQuery();
const ALL = { value: '', label: 'ทั้งหมด' };
const cancellable = (r) => ['upcoming', 'active'].includes(r.status);

async function cancel(r) {
  const reason = await confirmDialog({
    title: 'ยกเลิกการจอง',
    message: `ยกเลิกการจอง ${r.assetCode} ของ ${r.userFullName} ผู้จองจะได้รับแจ้งเตือน`,
    confirmLabel: 'ยกเลิกการจอง', cancelLabel: 'ไม่ยกเลิก', danger: true,
    reason: { label: 'เหตุผลที่ยกเลิก', required: true },
  });
  if (!reason) return;
  try {
    await api.cancelReservation(r.id, { reason });
    showToast('ยกเลิกการจองแล้ว');
  } catch (err) {
    presentError(err);
  }
  list.reload();
}

const list = createListView({
  caption: 'รายการจองทั้งหมด',
  empty: 'ไม่พบการจอง',
  fetch: ({ from, to, ...q }) => api.listReservations({ ...q, from: dayStartIso(from), to: dayEndIso(to), pageSize: 20 }),
  onQueryChange: writeQuery,
  columns: [
    { key: 'id', header: '#', render: (r) => r.id },
    { key: 'user', header: 'ผู้จอง', render: (r) => r.userFullName },
    { key: 'asset', header: 'เครื่อง', render: (r) => `${r.assetCode} ${r.modelName}` },
    { key: 'time', header: 'ช่วงเวลา', render: (r) => `${formatDateTime(r.startAt)} – ${formatTime(r.endAt)}` },
    { key: 'status', header: 'สถานะ', render: (r) => statusBadge('reservation', r.status) },
    { key: 'reason', header: 'เหตุผลที่ยกเลิก', render: (r) => r.cancelReason ?? '-' },
    {
      key: 'actions', header: '',
      render: (r) => cancellable(r) && h('button', { class: 'btn btn-danger', type: 'button', onClick: () => cancel(r) }, 'ยกเลิก'),
    },
  ],
});

const form = filterForm({
  values: query,
  fields: [
    { name: 'status', label: 'สถานะ', as: 'select', options: [ALL, ...STATUS_OPTIONS('reservation')] },
    { name: 'from', label: 'เริ่มตั้งแต่วันที่', type: 'date' },
    { name: 'to', label: 'ถึงวันที่', type: 'date' },
  ],
  onSubmit: (v) => list.setQuery(cleanQuery(v)),
});

replaceContent(main, h('div', { class: 'page-head' }, h('h1', null, 'รายการจอง')), form, list.el);
list.setQuery(cleanQuery(query));
