// จัดการเครื่อง (N1, N4–N8, D1): ตาราง + filter + เพิ่ม/แก้ไข/ลบ/กู้คืน
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { offerCancelReservations } from '../components/affectedReservations.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { filterForm } from '../components/filterForm.js';
import { openFormModal } from '../components/formModal.js';
import { createListView } from '../components/listView.js';
import { statusBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { presentError } from '../utils/errors.js';
import { cleanQuery, readQuery, writeQuery } from '../utils/query.js';
import { STATUS_OPTIONS } from '../utils/status.js';
import { validateNotebook } from '../utils/validate.js';

const main = await startPage({ role: 'admin', permission: 'catalog.manage', active: 'notebooks' });
const query = readQuery();
const ALL = { value: '', label: 'ทั้งหมด' };

const [brands, models] = await Promise.all([api.listBrandOptions(), api.listModels({ pageSize: 100 })])
  .then(([b, m]) => [b.data, m.data])
  .catch((err) => { presentError(err); return [[], []]; });

const editable = ['modelId', 'assetCode', 'serialNumber', 'conditionStatus', 'conditionNote', 'purchasedAt'];

function openNotebookForm(nb) {
  openFormModal({
    title: nb ? `แก้ไขเครื่อง ${nb.assetCode}` : 'เพิ่มเครื่อง',
    fields: [
      {
        name: 'modelId', label: 'รุ่น', as: 'select', value: String(nb?.modelId ?? ''),
        options: [{ value: '', label: 'เลือกรุ่น' }, ...models.map((m) => ({ value: String(m.id), label: `${m.brandName} ${m.modelName}` }))],
      },
      { name: 'assetCode', label: 'รหัสครุภัณฑ์', value: nb?.assetCode ?? '' },
      { name: 'serialNumber', label: 'Serial number', value: nb?.serialNumber ?? '' },
      { name: 'conditionStatus', label: 'สภาพเครื่อง', as: 'select', value: nb?.conditionStatus ?? 'normal', options: STATUS_OPTIONS('condition') },
      { name: 'conditionNote', label: 'หมายเหตุสภาพเครื่อง', as: 'textarea', value: nb?.conditionNote ?? '' },
      { name: 'purchasedAt', label: 'วันที่ซื้อ', type: 'date', value: nb?.purchasedAt ?? '' },
    ],
    validate: validateNotebook,
    errorFields: { ASSET_CODE_TAKEN: 'assetCode', SERIAL_NUMBER_TAKEN: 'serialNumber', MODEL_NOT_FOUND: 'modelId' },
    onSubmit: async (v, modal) => {
      const values = {
        modelId: Number(v.modelId), assetCode: v.assetCode.trim(), serialNumber: v.serialNumber.trim() || null,
        conditionStatus: v.conditionStatus, conditionNote: v.conditionNote.trim() || null, purchasedAt: v.purchasedAt || null,
      };
      if (!nb) {
        await api.createNotebook(values);
        modal.close();
        showToast('เพิ่มเครื่องแล้ว');
      } else {
        // PATCH ส่งเฉพาะ field ที่แก้
        const body = Object.fromEntries(editable.filter((k) => values[k] !== (nb[k] ?? null)).map((k) => [k, values[k]]));
        if (!Object.keys(body).length) {
          modal.close();
          return;
        }
        const { data } = await api.updateNotebook(nb.id, body);
        modal.close();
        showToast('บันทึกเครื่องแล้ว');
        await offerCancelReservations(data.warnings?.affectedReservations);
      }
      list.reload();
    },
  });
}

async function remove(nb) {
  const ok = await confirmDialog({ title: 'ลบเครื่อง', message: `ลบเครื่อง ${nb.assetCode} ใช่หรือไม่`, confirmLabel: 'ลบเครื่อง', danger: true });
  if (!ok) return;
  try {
    await api.deleteNotebook(nb.id);
    showToast('ลบเครื่องแล้ว');
    list.reload();
  } catch (err) {
    presentError(err); // NOTEBOOK_HAS_COMMITMENTS พร้อมจำนวนการยืม/การจองที่ค้างอยู่
  }
}

async function restore(nb) {
  try {
    await api.restoreNotebook(nb.id);
    showToast('กู้คืนเครื่องแล้ว');
    list.reload();
  } catch (err) {
    presentError(err);
  }
}

const list = createListView({
  caption: 'รายการเครื่อง',
  empty: 'ไม่พบเครื่อง',
  fetch: (q) => api.listNotebooks({ ...q, pageSize: 20 }),
  onQueryChange: writeQuery,
  columns: [
    { key: 'assetCode', header: 'รหัสเครื่อง', render: (n) => h('span', null, n.assetCode, n.deletedAt && [' ', h('span', { class: 'badge badge-muted' }, 'ลบแล้ว')]) },
    { key: 'model', header: 'ยี่ห้อ / รุ่น', render: (n) => `${n.brandName} ${n.modelName}` },
    { key: 'serial', header: 'Serial', render: (n) => n.serialNumber ?? '-' },
    { key: 'status', header: 'สถานะ', render: (n) => statusBadge('notebook', n.currentStatus) },
    { key: 'condition', header: 'สภาพ', render: (n) => statusBadge('condition', n.conditionStatus) },
    {
      key: 'actions', header: '',
      render: (n) => (n.deletedAt
        ? h('button', { class: 'btn', type: 'button', onClick: () => restore(n) }, 'กู้คืน')
        : h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onClick: () => openNotebookForm(n) }, 'แก้ไข'),
          h('button', { class: 'btn btn-danger', type: 'button', onClick: () => remove(n) }, 'ลบ'))),
    },
  ],
});

const form = filterForm({
  values: query,
  fields: [
    { name: 'keyword', label: 'ค้นหา (รหัส, serial, รุ่น, ยี่ห้อ)' },
    { name: 'brandId', label: 'ยี่ห้อ', as: 'select', options: [ALL, ...brands.map((b) => ({ value: String(b.id), label: b.name }))] },
    { name: 'currentStatus', label: 'สถานะ', as: 'select', options: [ALL, ...STATUS_OPTIONS('notebook')] },
    { name: 'conditionStatus', label: 'สภาพเครื่อง', as: 'select', options: [ALL, ...STATUS_OPTIONS('condition')] },
    { name: 'includeDeleted', label: 'แสดงที่ลบแล้ว', type: 'checkbox' },
  ],
  onSubmit: (v) => list.setQuery(cleanQuery(v)),
});

replaceContent(main,
  h('div', { class: 'page-head' },
    h('h1', null, 'จัดการเครื่อง'),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openNotebookForm() }, 'เพิ่มเครื่อง')),
  form, list.el);
list.setQuery(cleanQuery(query));
