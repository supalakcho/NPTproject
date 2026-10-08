// Audit Log (G1, G2): filter ผู้กระทำ/action/ตาราง/ช่วงวันที่ · รายละเอียดเทียบ oldValues กับ newValues
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { dataTable } from '../components/dataTable.js';
import { filterForm } from '../components/filterForm.js';
import { createListView } from '../components/listView.js';
import { openModal } from '../components/modal.js';
import { dayEndIso, dayStartIso, formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { cleanQuery, readQuery, writeQuery } from '../utils/query.js';

const main = await startPage({ role: 'admin', permission: 'audit.view', active: 'audit-logs' });
const query = readQuery();

const show = (v) => (v === undefined ? '-' : typeof v === 'string' ? v : JSON.stringify(v));

async function showDetail(log) {
  try {
    const { data } = await api.getAuditLog(log.id);
    const keys = [...new Set([...Object.keys(data.oldValues ?? {}), ...Object.keys(data.newValues ?? {})])];
    openModal({
      title: `${data.action} ${data.targetTable} #${data.targetId}`,
      content: h('div', null,
        h('p', null, `${data.userFullName} · ${formatDateTime(data.createdAt)} · IP ${data.ipAddress ?? '-'}`),
        dataTable({
          caption: 'ค่าก่อนและหลังการเปลี่ยนแปลง',
          empty: 'ไม่มีรายละเอียดการเปลี่ยนแปลง',
          columns: [
            { key: 'key', header: 'ข้อมูล' },
            { key: 'old', header: 'ก่อน', render: (r) => h('span', { class: 'diff-old' }, show(r.old)) },
            { key: 'new', header: 'หลัง', render: (r) => h('span', { class: 'diff-new' }, show(r.new)) },
          ],
          rows: keys.map((key) => ({ key, old: data.oldValues?.[key], new: data.newValues?.[key] })),
        })),
      actions: [{ label: 'ปิด', onClick: (m) => m.close() }],
    });
  } catch (err) {
    presentError(err);
  }
}

const list = createListView({
  caption: 'บันทึกการใช้งานระบบ',
  empty: 'ไม่พบบันทึก',
  fetch: ({ from, to, ...q }) => api.listAuditLogs({ ...q, from: dayStartIso(from), to: dayEndIso(to), pageSize: 20 }),
  onQueryChange: writeQuery,
  columns: [
    { key: 'createdAt', header: 'เวลา', render: (a) => formatDateTime(a.createdAt) },
    { key: 'user', header: 'ผู้กระทำ', render: (a) => a.userFullName },
    { key: 'action', header: 'การกระทำ', render: (a) => a.action },
    { key: 'table', header: 'ตาราง', render: (a) => `${a.targetTable} #${a.targetId}` },
    { key: 'detail', header: '', render: (a) => h('button', { class: 'btn', type: 'button', onClick: () => showDetail(a) }, 'รายละเอียด') },
  ],
});

const form = filterForm({
  values: query,
  fields: [
    { name: 'userId', label: 'รหัสผู้กระทำ (user id)', type: 'number' },
    { name: 'action', label: 'การกระทำ (เช่น CREATE, UPDATE)' },
    { name: 'targetTable', label: 'ตาราง (เช่น loans)' },
    { name: 'from', label: 'ตั้งแต่วันที่', type: 'date' },
    { name: 'to', label: 'ถึงวันที่', type: 'date' },
  ],
  onSubmit: (v) => list.setQuery(cleanQuery(v)),
});

replaceContent(main, h('div', { class: 'page-head' }, h('h1', null, 'Audit Log')), form, list.el);
list.setQuery(cleanQuery(query));
