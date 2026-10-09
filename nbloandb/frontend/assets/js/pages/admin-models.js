// จัดการรุ่น (D1–D7, B1): เพิ่ม แก้ไข ลบ อัปโหลดรูป
import { mediaUrl } from '../config.js';
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { showErrors } from '../components/fieldError.js';
import { filterForm } from '../components/filterForm.js';
import { openFormModal } from '../components/formModal.js';
import { createListView } from '../components/listView.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { presentError } from '../utils/errors.js';
import { cleanQuery, readQuery, writeQuery } from '../utils/query.js';
import { validateImage, validateModel } from '../utils/validate.js';

const main = await startPage({ role: 'admin', permission: 'model.manage', active: 'models' });
const query = readQuery();
const { data: brands } = await api.listBrandOptions().catch((err) => { presentError(err); return { data: [] }; });
const brandOptions = brands.map((b) => ({ value: String(b.id), label: b.name }));

function openModelForm(model) {
  openFormModal({
    title: model ? `แก้ไขรุ่น ${model.modelName}` : 'เพิ่มรุ่น',
    fields: [
      { name: 'brandId', label: 'ยี่ห้อ', as: 'select', options: [{ value: '', label: 'เลือกยี่ห้อ' }, ...brandOptions], value: String(model?.brandId ?? '') },
      { name: 'modelName', label: 'ชื่อรุ่น', value: model?.modelName ?? '' },
      { name: 'cpu', label: 'CPU', value: model?.cpu ?? '' },
      { name: 'ramGb', label: 'RAM (GB)', type: 'number', value: String(model?.ramGb ?? ''), hint: '1–256', attrs: { min: 1, max: 256, inputmode: 'numeric' } },
      { name: 'storageGb', label: 'พื้นที่จัดเก็บ (GB)', type: 'number', value: String(model?.storageGb ?? ''), hint: '1–8192', attrs: { min: 1, max: 8192, inputmode: 'numeric' } },
      { name: 'screenInch', label: 'ขนาดจอ (นิ้ว)', type: 'number', value: String(model?.screenInch ?? ''), hint: '10.0–18.0', attrs: { min: 10, max: 18, step: 0.1, inputmode: 'decimal' } },
      { name: 'os', label: 'ระบบปฏิบัติการ', value: model?.os ?? '' },
    ],
    validate: validateModel,
    errorFields: { MODEL_NAME_TAKEN: 'modelName', BRAND_NOT_FOUND: 'brandId' },
    onSubmit: async (v, modal) => {
      const body = {
        brandId: Number(v.brandId), modelName: v.modelName.trim(), cpu: v.cpu.trim(), ramGb: Number(v.ramGb),
        storageGb: Number(v.storageGb), screenInch: Number(v.screenInch), os: v.os.trim(),
      };
      if (model) await api.updateModel(model.id, body);
      else await api.createModel(body);
      modal.close();
      showToast(model ? 'บันทึกรุ่นแล้ว' : 'เพิ่มรุ่นแล้ว');
      list.reload();
    },
  });
}

function openImage(model) {
  const input = h('input', { type: 'file', id: 'model-image', accept: 'image/jpeg,image/png,image/webp', 'aria-describedby': 'model-image-err' });
  const body = h('div', { class: 'field' },
    h('label', { for: 'model-image' }, 'เลือกรูป (jpg, png, webp ไม่เกิน 2 MB)'), input,
    h('div', { class: 'field-error', id: 'model-image-err', role: 'alert', dataset: { errorFor: 'image' } }));
  input.name = 'image';
  openModal({
    title: `รูปของรุ่น ${model.modelName}`,
    content: body,
    actions: [
      { label: 'ยกเลิก', onClick: (m) => m.close() },
      {
        label: 'อัปโหลด', variant: 'primary',
        onClick: async (m) => {
          const file = input.files[0];
          const { valid, errors } = validateImage(file);
          if (!valid) {
            showErrors(body, errors);
            return;
          }
          try {
            await api.uploadModelImage(model.id, file);
            m.close();
            showToast('อัปโหลดรูปแล้ว');
            list.reload();
          } catch (err) {
            if (err.code === 'INVALID_FILE') showErrors(body, { image: err.message });
            else presentError(err);
          }
        },
      },
    ],
  });
}

async function remove(model) {
  const ok = await confirmDialog({ title: 'ลบรุ่น', message: `ลบรุ่น ${model.modelName} ใช่หรือไม่`, confirmLabel: 'ลบรุ่น', danger: true });
  if (!ok) return;
  try {
    await api.deleteModel(model.id);
    showToast('ลบรุ่นแล้ว');
    list.reload();
  } catch (err) {
    presentError(err); // MODEL_IN_USE แสดงจำนวนเครื่องที่ใช้อยู่
  }
}

// TODO: D7 (กู้คืนรุ่น) มี endpoint แต่ D1 ไม่มี includeDeleted จึงยังไม่มีทางแสดงรุ่นที่ลบแล้ว (ดูหัวข้อ spec ยังไม่รองรับ)
const list = createListView({
  caption: 'รายการรุ่น',
  empty: 'ไม่พบรุ่น',
  fetch: (q) => api.listModels({ ...q, pageSize: 20 }),
  onQueryChange: writeQuery,
  columns: [
    { key: 'image', header: 'รูป', render: (m) => (mediaUrl(m.imageUrl) ? h('img', { src: mediaUrl(m.imageUrl), alt: m.modelName, style: 'height:40px' }) : '-') },
    { key: 'model', header: 'ยี่ห้อ / รุ่น', render: (m) => `${m.brandName} ${m.modelName}` },
    { key: 'cpu', header: 'CPU', render: (m) => m.cpu },
    { key: 'spec', header: 'สเปก', render: (m) => `RAM ${m.ramGb} GB · ${m.storageGb} GB · จอ ${m.screenInch}"` },
    { key: 'os', header: 'ระบบปฏิบัติการ', render: (m) => m.os },
    {
      key: 'actions', header: '',
      render: (m) => h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onClick: () => openModelForm(m) }, 'แก้ไข'),
        h('button', { class: 'btn', type: 'button', onClick: () => openImage(m) }, 'เปลี่ยนรูป'),
        h('button', { class: 'btn btn-danger', type: 'button', onClick: () => remove(m) }, 'ลบ')),
    },
  ],
});

const form = filterForm({
  values: query,
  fields: [
    { name: 'keyword', label: 'ค้นหาชื่อรุ่น' },
    { name: 'brandId', label: 'ยี่ห้อ', as: 'select', options: [{ value: '', label: 'ทั้งหมด' }, ...brandOptions] },
  ],
  onSubmit: (v) => list.setQuery(cleanQuery(v)),
});

replaceContent(main,
  h('div', { class: 'page-head' },
    h('h1', null, 'จัดการรุ่น'),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openModelForm() }, 'เพิ่มรุ่น')),
  form, list.el);
list.setQuery(cleanQuery(query));
