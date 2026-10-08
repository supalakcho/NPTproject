// ค้นหาเครื่อง (N1) + แท็บหาเครื่องว่างตามช่วงเวลา (N2) แล้วจองได้ทันที (R1)
import { appUrl } from '../config.js';
import * as api from '../core/api.js';
import { nowMs } from '../core/clock.js';
import { h, loadView, replaceContent, runExclusive } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { confirmDialog } from '../components/confirmDialog.js';
import { createListView } from '../components/listView.js';
import { dataTable } from '../components/dataTable.js';
import { dateTimeRange } from '../components/dateTimeRange.js';
import { showErrors, createField } from '../components/fieldError.js';
import { filterForm } from '../components/filterForm.js';
import { statusBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { formatDateTime, formatTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { readQuery, writeQuery } from '../utils/query.js';
import { STATUS_OPTIONS } from '../utils/status.js';
import { validateReservation } from '../utils/validate.js';

const main = await startPage({ role: 'member', active: 'notebooks' });
const query = readQuery();
const ALL = { value: '', label: 'ทั้งหมด' };

const [brands, models, settings] = await Promise.all([
  api.listBrandOptions(), api.listModels({ pageSize: 100 }), api.getPublicSettings(),
]).then(([b, m, s]) => [b.data, m.data, s.data]).catch((err) => {
  presentError(err);
  return [[], [], { maxLoanHours: 24, reservationMaxDaysAhead: 7 }];
});
const modelOptions = [ALL, ...models.map((m) => ({ value: String(m.id), label: `${m.brandName} ${m.modelName}` }))];

// ---------- แท็บ 1: ค้นหาเครื่อง ----------
function searchPanel() {
  const list = createListView({
    caption: 'ผลการค้นหาเครื่อง',
    empty: 'ไม่พบเครื่องที่ตรงกับเงื่อนไข',
    fetch: (q) => api.listNotebooks({ ...q, pageSize: 20 }),
    onQueryChange: (q) => writeQuery({ tab: 'search', ...q }),
    columns: [
      { key: 'assetCode', header: 'รหัสเครื่อง', render: (n) => h('a', { href: appUrl(`member/notebook.html?id=${n.id}`) }, n.assetCode) },
      { key: 'model', header: 'ยี่ห้อ / รุ่น', render: (n) => `${n.brandName} ${n.modelName}` },
      { key: 'spec', header: 'สเปก', render: (n) => `${n.cpu} · RAM ${n.ramGb} GB · ${n.storageGb} GB` },
      { key: 'status', header: 'สถานะ', render: (n) => statusBadge('notebook', n.currentStatus) },
    ],
  });

  const initial = { keyword: query.keyword, brandId: query.brandId, modelId: query.modelId, currentStatus: query.currentStatus, page: query.page };
  const form = filterForm({
    values: initial,
    fields: [
      { name: 'keyword', label: 'ค้นหา (รหัสเครื่อง, รุ่น, ยี่ห้อ)' },
      { name: 'brandId', label: 'ยี่ห้อ', as: 'select', options: [ALL, ...brands.map((b) => ({ value: String(b.id), label: b.name }))] },
      { name: 'modelId', label: 'รุ่น', as: 'select', options: modelOptions },
      { name: 'currentStatus', label: 'สถานะ', as: 'select', options: [ALL, ...STATUS_OPTIONS('notebook').map((o) => ({ value: o.value, label: o.label }))] },
    ],
    onSubmit: (values) => list.setQuery(clean(values)),
  });

  list.setQuery(clean(initial));
  return h('div', { role: 'tabpanel' }, form, list.el);
}

const clean = (values) => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''));

// ---------- แท็บ 2: หาเครื่องว่างตามช่วงเวลา ----------
function availablePanel() {
  const range = dateTimeRange({
    startLabel: 'เริ่มใช้งาน', endLabel: 'สิ้นสุด', start: query.startAt, end: query.endAt,
    min: new Date(nowMs()).toISOString(), max: new Date(nowMs() + settings.reservationMaxDaysAhead * 86_400_000 + settings.maxLoanHours * 3_600_000).toISOString(),
  });
  const modelField = createField({ name: 'modelId', label: 'รุ่น (ไม่บังคับ)', as: 'select', options: modelOptions, value: query.modelId ?? '' });
  const results = h('div', { 'aria-live': 'polite' });
  const searchBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'ค้นหาเครื่องว่าง');
  const form = h('form', { novalidate: true }, range.el, modelField, searchBtn);

  async function reserve(notebook, { startAt, endAt }) {
    const ok = await confirmDialog({
      title: `จอง ${notebook.assetCode}`,
      message: `${notebook.brandName} ${notebook.modelName}\n${formatDateTime(startAt)} – ${formatTime(endAt)}`,
      confirmLabel: 'ยืนยันจอง',
    });
    if (!ok) return;
    try {
      await api.createReservation({ notebookId: notebook.id, startAt, endAt });
      showToast('จองเครื่องแล้ว', { action: { label: 'ดูการจองของฉัน', onClick: () => location.assign(appUrl('member/home.html')) } });
    } catch (err) {
      presentError(err);
    }
    await search();
  }

  async function search() {
    const { startAt, endAt } = range.getValue();
    const { valid, errors } = validateReservation({ startAt, endAt }, { now: nowMs(), settings });
    if (!valid) {
      showErrors(form, errors);
      return;
    }
    const modelId = form.querySelector('[name="modelId"]').value;
    writeQuery({ tab: 'available', startAt, endAt, modelId });
    await loadView(results, () => api.searchAvailableNotebooks({ startAt, endAt, modelId }), ({ data }) => dataTable({
      caption: 'เครื่องที่ว่างในช่วงเวลาที่เลือก',
      empty: 'ไม่มีเครื่องว่างในช่วงเวลานี้ ลองเปลี่ยนช่วงเวลาหรือรุ่น',
      rows: data,
      columns: [
        { key: 'assetCode', header: 'รหัสเครื่อง', render: (n) => h('a', { href: appUrl(`member/notebook.html?id=${n.id}`) }, n.assetCode) },
        { key: 'model', header: 'ยี่ห้อ / รุ่น', render: (n) => `${n.brandName} ${n.modelName}` },
        { key: 'spec', header: 'สเปก', render: (n) => `${n.cpu} · RAM ${n.ramGb} GB · ${n.storageGb} GB` },
        {
          key: 'action', header: '',
          render: (n) => h('button', { class: 'btn', type: 'button', onClick: () => reserve(n, { startAt, endAt }) }, 'จองเครื่องนี้'),
        },
      ],
    }));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runExclusive(searchBtn, search, 'กำลังค้นหา...');
  });

  if (query.startAt && query.endAt) search();
  return h('div', { role: 'tabpanel' }, form, results);
}

// ---------- แท็บ ----------
const TABS = [{ key: 'search', label: 'ค้นหาเครื่อง', build: searchPanel }, { key: 'available', label: 'หาเครื่องว่างตามช่วงเวลา', build: availablePanel }];
const panel = h('div');
const tabBar = h('div', { class: 'tabs', role: 'tablist' });

function selectTab(key) {
  for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.dataset.tab === key));
  replaceContent(panel, TABS.find((t) => t.key === key).build());
}

for (const t of TABS) {
  tabBar.append(h('button', {
    type: 'button', role: 'tab', dataset: { tab: t.key }, 'aria-selected': 'false',
    onClick: () => { for (const k of Object.keys(query)) delete query[k]; query.tab = t.key; selectTab(t.key); },
  }, t.label));
}

replaceContent(main, h('h1', null, 'ค้นหาเครื่อง'), tabBar, panel);
selectTab(query.tab === 'available' ? 'available' : 'search');
