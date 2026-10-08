// รายงาน (P1–P5): สรุปสถานะเป็นตารางเดียว · 3 รายงานเป็นตาราง · รายงานรายเดือนเป็นตาราง + กราฟแท่ง SVG
import * as api from '../core/api.js';
import { nowMs } from '../core/clock.js';
import { h, loadView, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { barChart } from '../components/barChart.js';
import { dataTable } from '../components/dataTable.js';
import { createField, readForm, showErrors } from '../components/fieldError.js';
import { filterForm } from '../components/filterForm.js';
import { createListView } from '../components/listView.js';
import { lateBadge, statusBadge } from '../components/statusBadge.js';
import { formatDateTime } from '../utils/datetime.js';
import { monthOf } from '../utils/datetime.js';
import { cleanQuery } from '../utils/query.js';
import { STATUS_OPTIONS } from '../utils/status.js';
import { validateMonthRange } from '../utils/validate.js';

const main = await startPage({ role: 'admin', permission: 'report.view', active: 'reports' });
const ALL = { value: '', label: 'ทั้งหมด' };

const [brands, models] = await Promise.all([api.listBrandOptions(), api.listModels({ pageSize: 100 })])
  .then(([b, m]) => [b.data, m.data]).catch(() => [[], []]);
const brandOptions = [ALL, ...brands.map((b) => ({ value: String(b.id), label: b.name }))];
const modelOptions = [ALL, ...models.map((m) => ({ value: String(m.id), label: `${m.brandName} ${m.modelName}` }))];

const notebookColumns = [
  { key: 'assetCode', header: 'รหัสเครื่อง', render: (n) => n.assetCode },
  { key: 'model', header: 'ยี่ห้อ / รุ่น', render: (n) => `${n.brandName} ${n.modelName}` },
  { key: 'status', header: 'สถานะ', render: (n) => statusBadge('notebook', n.currentStatus) },
];

// ---------- สรุป P1 ----------
const summaryEl = h('div');
const SUMMARY_ROWS = [
  ['total', 'เครื่องทั้งหมด'], ['available', 'ว่าง'], ['borrowed', 'ถูกยืม'], ['reserved', 'ถูกจอง'],
  ['damaged', 'เสียหาย'], ['maintenance', 'ซ่อมบำรุง'], ['retired', 'ปลดระวาง'],
];
const loadSummary = () => loadView(summaryEl, () => api.getReportSummary().then((r) => r.data),
  (s) => dataTable({
    caption: 'ตารางสรุปสถานะเครื่อง',
    columns: [{ key: 'label', header: 'สถานะ' }, { key: 'count', header: 'จำนวน (เครื่อง)' }],
    rows: SUMMARY_ROWS.map(([key, label]) => ({ label, count: s[key] })),
  }));

// ---------- แท็บรายงาน ----------
function listReport({ fetch, columns, empty, fields }) {
  const list = createListView({ fetch, columns, empty });
  const form = filterForm({ fields, onSubmit: (v) => list.setQuery(cleanQuery(v)) });
  list.setQuery({});
  return h('div', { role: 'tabpanel' }, form, list.el);
}

function monthlyReport() {
  const now = nowMs();
  const form = h('form', { novalidate: true },
    h('div', { class: 'filter-grid' },
      createField({ name: 'fromMonth', label: 'ตั้งแต่เดือน', type: 'month', value: monthOf(now, -5) }),
      createField({ name: 'toMonth', label: 'ถึงเดือน', type: 'month', value: monthOf(now), hint: 'เลือกช่วงได้ไม่เกิน 24 เดือน' })),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'ดูรายงาน'));
  const result = h('div', { 'aria-live': 'polite' });

  async function run() {
    const values = readForm(form);
    const { valid, errors } = validateMonthRange(values);
    if (!valid) {
      showErrors(form, errors);
      return;
    }
    showErrors(form, {});
    await loadView(result, () => api.getReportMonthlyLoans(values), ({ data }) => h('div', null,
      barChart(data),
      dataTable({
        caption: 'จำนวนการยืมรายเดือน',
        columns: [
          { key: 'loanMonth', header: 'เดือน' },
          { key: 'totalLoans', header: 'ยืมทั้งหมด (ครั้ง)' },
          { key: 'lateLoans', header: 'คืนช้า (ครั้ง)' },
        ],
        rows: data,
      })));
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  run();
  return h('div', { role: 'tabpanel' }, form, result);
}

const TABS = [
  {
    key: 'notebooks', label: 'เครื่องทั้งหมด',
    build: () => listReport({
      fetch: (q) => api.getReportNotebooks({ ...q, pageSize: 20 }), columns: notebookColumns, empty: 'ไม่พบเครื่อง',
      fields: [
        { name: 'keyword', label: 'ค้นหา' },
        { name: 'currentStatus', label: 'สถานะ', as: 'select', options: [ALL, ...STATUS_OPTIONS('notebook')] },
      ],
    }),
  },
  {
    key: 'outstanding', label: 'ยืมค้าง',
    build: () => listReport({
      fetch: (q) => api.getReportOutstandingLoans({ ...q, pageSize: 20 }), empty: 'ไม่มีรายการยืมค้าง',
      columns: [
        { key: 'user', header: 'ผู้ยืม', render: (l) => l.userFullName },
        { key: 'asset', header: 'เครื่อง', render: (l) => `${l.assetCode} ${l.modelName}` },
        { key: 'dueAt', header: 'กำหนดคืน', render: (l) => formatDateTime(l.dueAt) },
        { key: 'status', header: 'สถานะ', render: (l) => h('span', null, statusBadge('loan', l.loanStatus), l.isLate && [' ', lateBadge()]) },
      ],
      fields: [{
        name: 'status', label: 'สถานะ', as: 'select',
        options: [ALL, ...STATUS_OPTIONS('loan').filter((o) => ['borrowing', 'overdue', 'return_pending'].includes(o.value))],
      }],
    }),
  },
  {
    key: 'available', label: 'เครื่องว่าง',
    build: () => listReport({
      fetch: (q) => api.getReportAvailableNotebooks({ ...q, pageSize: 20 }), columns: notebookColumns, empty: 'ไม่มีเครื่องว่าง',
      fields: [{ name: 'brandId', label: 'ยี่ห้อ', as: 'select', options: brandOptions }, { name: 'modelId', label: 'รุ่น', as: 'select', options: modelOptions }],
    }),
  },
  { key: 'monthly', label: 'รายเดือน', build: monthlyReport },
];

const panel = h('div');
const tabBar = h('div', { class: 'tabs', role: 'tablist' });
function selectTab(tab) {
  for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab.key));
  replaceContent(panel, tab.build());
}
for (const t of TABS) {
  tabBar.append(h('button', { type: 'button', role: 'tab', dataset: { tab: t.key }, 'aria-selected': 'false', onClick: () => selectTab(t) }, t.label));
}

replaceContent(main,
  h('div', { class: 'page-head' }, h('h1', null, 'รายงาน')),
  h('section', { class: 'section', 'aria-labelledby': 'h-summary' }, h('h2', { id: 'h-summary' }, 'สรุปสถานะเครื่อง'), summaryEl),
  tabBar, panel);
selectTab(TABS[0]);
await loadSummary();
