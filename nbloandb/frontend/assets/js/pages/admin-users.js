// สมาชิก (U1–U7): ระงับ/เปิดใช้งาน/ลบ/กู้คืน · แสดง activeLoanCount ในรายละเอียด
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { filterForm } from '../components/filterForm.js';
import { openFormModal } from '../components/formModal.js';
import { createListView } from '../components/listView.js';
import { openModal } from '../components/modal.js';
import { statusBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { cleanQuery, readQuery, writeQuery } from '../utils/query.js';
import { validateProfile } from '../utils/validate.js';

const main = await startPage({ role: 'admin', permission: 'user.manage', active: 'users' });
const query = readQuery();
const ALL = { value: '', label: 'ทั้งหมด' };
const stateOf = (u) => (u.deletedAt ? 'deleted' : u.isActive ? 'active' : 'suspended');
const fullName = (u) => `${u.firstName} ${u.lastName}`;

/** เรียก endpoint แล้วรีเฟรชรายการ; error (เช่น CANNOT_MODIFY_SELF, LAST_ADMIN) แสดงข้อความจาก backend */
async function act(fn, success) {
  try {
    await fn();
    showToast(success);
  } catch (err) {
    presentError(err);
  }
  list.reload();
}

async function suspend(u) {
  const ok = await confirmDialog({ title: 'ระงับบัญชี', message: `ระงับบัญชีของ ${fullName(u)} ใช่หรือไม่`, confirmLabel: 'ระงับบัญชี', danger: true });
  if (ok) await act(() => api.suspendUser(u.id), 'ระงับบัญชีแล้ว');
}

async function remove(u) {
  const ok = await confirmDialog({ title: 'ลบสมาชิก', message: `ลบ ${fullName(u)} ใช่หรือไม่`, confirmLabel: 'ลบสมาชิก', danger: true });
  if (ok) await act(() => api.deleteUser(u.id), 'ลบสมาชิกแล้ว');
}

async function showDetail(u) {
  try {
    const { data } = await api.getUser(u.id);
    const row = (label, value) => [h('dt', null, label), h('dd', null, value ?? '-')];
    openModal({
      title: fullName(data),
      content: h('dl', { class: 'dl' },
        row('อีเมล', data.email), row('รหัสสมาชิก', data.memberCode), row('เบอร์โทร', data.phone), row('บทบาท', data.roleName),
        row('สถานะ', statusBadge('user', stateOf(data))), row('เครื่องที่ยืมค้างอยู่', `${data.activeLoanCount} เครื่อง`),
        row('เข้าสู่ระบบล่าสุด', data.lastLoginAt && formatDateTime(data.lastLoginAt)), row('สมัครเมื่อ', formatDateTime(data.createdAt))),
      actions: [{ label: 'ปิด', onClick: (m) => m.close() }],
    });
  } catch (err) {
    presentError(err);
  }
}

// TODO: เปลี่ยน role ผู้ใช้ — U3 รับ roleId แต่ spec ยังไม่มี endpoint รายการ role จึงยังไม่ทำ UI นี้
function openEdit(u) {
  openFormModal({
    title: `แก้ไข ${fullName(u)}`,
    fields: [
      { name: 'firstName', label: 'ชื่อ', value: u.firstName },
      { name: 'lastName', label: 'นามสกุล', value: u.lastName },
      { name: 'phone', label: 'เบอร์โทร', type: 'tel', value: u.phone ?? '' },
      { name: 'email', label: 'อีเมล', type: 'email', value: u.email },
      { name: 'memberCode', label: 'รหัสสมาชิก', value: u.memberCode ?? '' },
    ],
    validate: validateProfile,
    errorFields: { EMAIL_TAKEN: 'email', MEMBER_CODE_TAKEN: 'memberCode' },
    onSubmit: async (v, modal) => {
      const next = { firstName: v.firstName.trim(), lastName: v.lastName.trim(), phone: v.phone.trim(), email: v.email.trim(), memberCode: v.memberCode.trim() };
      const body = Object.fromEntries(Object.entries(next).filter(([k, val]) => val !== (u[k] ?? '')));
      if (Object.keys(body).length) await api.updateUser(u.id, body);
      modal.close();
      showToast('บันทึกข้อมูลสมาชิกแล้ว');
      list.reload();
    },
  });
}

const list = createListView({
  caption: 'รายชื่อสมาชิก',
  empty: 'ไม่พบสมาชิก',
  fetch: (q) => api.listUsers({ ...q, pageSize: 20 }),
  onQueryChange: writeQuery,
  columns: [
    { key: 'name', header: 'ชื่อ', render: fullName },
    { key: 'email', header: 'อีเมล', render: (u) => u.email },
    { key: 'memberCode', header: 'รหัสสมาชิก', render: (u) => u.memberCode ?? '-' },
    { key: 'role', header: 'บทบาท', render: (u) => u.roleName },
    { key: 'state', header: 'สถานะ', render: (u) => statusBadge('user', stateOf(u)) },
    {
      key: 'actions', header: '',
      render: (u) => h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onClick: () => showDetail(u) }, 'รายละเอียด'),
        !u.deletedAt && h('button', { class: 'btn', type: 'button', onClick: () => openEdit(u) }, 'แก้ไข'),
        !u.deletedAt && (u.isActive
          ? h('button', { class: 'btn btn-danger', type: 'button', onClick: () => suspend(u) }, 'ระงับ')
          : h('button', { class: 'btn', type: 'button', onClick: () => act(() => api.activateUser(u.id), 'เปิดใช้งานบัญชีแล้ว') }, 'เปิดใช้งาน')),
        u.deletedAt
          ? h('button', { class: 'btn', type: 'button', onClick: () => act(() => api.restoreUser(u.id), 'กู้คืนสมาชิกแล้ว') }, 'กู้คืน')
          : h('button', { class: 'btn btn-danger', type: 'button', onClick: () => remove(u) }, 'ลบ')),
    },
  ],
});

const form = filterForm({
  values: query,
  fields: [
    { name: 'keyword', label: 'ค้นหา (ชื่อ, อีเมล, รหัสสมาชิก)' },
    { name: 'isActive', label: 'สถานะบัญชี', as: 'select', options: [ALL, { value: 'true', label: 'ใช้งานอยู่' }, { value: 'false', label: 'ถูกระงับ' }] },
    { name: 'includeDeleted', label: 'แสดงที่ลบแล้ว', type: 'checkbox' },
  ],
  onSubmit: (v) => list.setQuery(cleanQuery(v)),
});

replaceContent(main, h('div', { class: 'page-head' }, h('h1', null, 'สมาชิก')), form, list.el);
list.setQuery(cleanQuery(query));
