// จัดการยี่ห้อ (B2–B6): เพิ่ม แก้ไข ลบ กู้คืน
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { filterForm } from '../components/filterForm.js';
import { openFormModal } from '../components/formModal.js';
import { createListView } from '../components/listView.js';
import { showToast } from '../components/toast.js';
import { formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { cleanQuery, readQuery, writeQuery } from '../utils/query.js';
import { validateBrand } from '../utils/validate.js';

const main = await startPage({ role: 'admin', permission: 'catalog.manage', active: 'brands' });
const query = readQuery();

function openBrandForm(brand) {
  openFormModal({
    title: brand ? `แก้ไขยี่ห้อ ${brand.name}` : 'เพิ่มยี่ห้อ',
    fields: [{ name: 'name', label: 'ชื่อยี่ห้อ', value: brand?.name ?? '' }],
    validate: validateBrand,
    errorFields: { BRAND_NAME_TAKEN: 'name' },
    onSubmit: async ({ name }, modal) => {
      if (brand) await api.updateBrand(brand.id, { name: name.trim() });
      else await api.createBrand({ name: name.trim() });
      modal.close();
      showToast(brand ? 'บันทึกยี่ห้อแล้ว' : 'เพิ่มยี่ห้อแล้ว');
      list.reload();
    },
  });
}

async function remove(brand) {
  const ok = await confirmDialog({ title: 'ลบยี่ห้อ', message: `ลบยี่ห้อ ${brand.name} ใช่หรือไม่`, confirmLabel: 'ลบยี่ห้อ', danger: true });
  if (!ok) return;
  try {
    await api.deleteBrand(brand.id);
    showToast('ลบยี่ห้อแล้ว');
    list.reload();
  } catch (err) {
    presentError(err); // BRAND_IN_USE แสดงจำนวนรุ่นที่ใช้อยู่
  }
}

async function restore(brand) {
  try {
    await api.restoreBrand(brand.id);
    showToast('กู้คืนยี่ห้อแล้ว');
    list.reload();
  } catch (err) {
    presentError(err);
  }
}

const list = createListView({
  caption: 'รายการยี่ห้อ',
  empty: 'ไม่พบยี่ห้อ',
  fetch: (q) => api.listBrands({ ...q, pageSize: 20 }),
  onQueryChange: writeQuery,
  columns: [
    { key: 'name', header: 'ชื่อยี่ห้อ', render: (b) => h('span', null, b.name, b.deletedAt && [' ', h('span', { class: 'badge badge-muted' }, 'ลบแล้ว')]) },
    { key: 'createdAt', header: 'สร้างเมื่อ', render: (b) => formatDateTime(b.createdAt) },
    {
      key: 'actions', header: '',
      render: (b) => (b.deletedAt
        ? h('button', { class: 'btn', type: 'button', onClick: () => restore(b) }, 'กู้คืน')
        : h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onClick: () => openBrandForm(b) }, 'แก้ไข'),
          h('button', { class: 'btn btn-danger', type: 'button', onClick: () => remove(b) }, 'ลบ'))),
    },
  ],
});

const form = filterForm({
  values: query,
  fields: [{ name: 'keyword', label: 'ค้นหาชื่อยี่ห้อ' }, { name: 'includeDeleted', label: 'แสดงที่ลบแล้ว', type: 'checkbox' }],
  onSubmit: (v) => list.setQuery(cleanQuery(v)),
});

replaceContent(main,
  h('div', { class: 'page-head' },
    h('h1', null, 'จัดการยี่ห้อ'),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openBrandForm() }, 'เพิ่มยี่ห้อ')),
  form, list.el);
list.setQuery(cleanQuery(query));
