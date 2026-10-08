// ประวัติ: 2 แท็บ (การยืม M5 / การจอง M6) กรองตามสถานะ
import * as api from '../core/api.js';
import { h, replaceContent } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { createListView } from '../components/listView.js';
import { filterForm } from '../components/filterForm.js';
import { lateBadge, statusBadge } from '../components/statusBadge.js';
import { formatDateTime, formatTime } from '../utils/datetime.js';
import { readQuery, writeQuery } from '../utils/query.js';
import { STATUS_OPTIONS } from '../utils/status.js';

const main = await startPage({ role: 'member', active: 'history' });
const query = readQuery();
const ALL = { value: '', label: 'ทั้งหมด' };
const clean = (values) => Object.fromEntries(Object.entries(values).filter(([, v]) => v));

const TABS = [
  {
    key: 'loans', label: 'การยืม', kind: 'loan', empty: 'ยังไม่มีประวัติการยืม',
    fetch: (q) => api.listMyLoans({ ...q, pageSize: 20 }),
    columns: [
      { key: 'asset', header: 'เครื่อง', render: (l) => `${l.assetCode} ${l.modelName}` },
      { key: 'borrowedAt', header: 'ยืมเมื่อ', render: (l) => formatDateTime(l.borrowedAt) },
      { key: 'dueAt', header: 'กำหนดคืน', render: (l) => formatDateTime(l.dueAt) },
      { key: 'returnedAt', header: 'คืนเมื่อ', render: (l) => (l.returnedAt ? formatDateTime(l.returnedAt) : '-') },
      {
        key: 'status', header: 'สถานะ',
        render: (l) => h('span', null, statusBadge('loan', l.loanStatus), l.isLate && [' ', lateBadge()]),
      },
    ],
  },
  {
    key: 'reservations', label: 'การจอง', kind: 'reservation', empty: 'ยังไม่มีประวัติการจอง',
    fetch: (q) => api.listMyReservations({ ...q, pageSize: 20 }),
    columns: [
      { key: 'asset', header: 'เครื่อง', render: (r) => `${r.assetCode} ${r.modelName}` },
      { key: 'time', header: 'ช่วงเวลา', render: (r) => `${formatDateTime(r.startAt)} – ${formatTime(r.endAt)}` },
      { key: 'status', header: 'สถานะ', render: (r) => statusBadge('reservation', r.status) },
      { key: 'cancelReason', header: 'เหตุผลที่ยกเลิก', render: (r) => r.cancelReason ?? '-' },
    ],
  },
];

const panel = h('div');
const tabBar = h('div', { class: 'tabs', role: 'tablist' });

function selectTab(tab, values = {}) {
  for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab.key));
  const list = createListView({
    fetch: tab.fetch, columns: tab.columns, empty: tab.empty, caption: `ประวัติ${tab.label}`,
    onQueryChange: (q) => writeQuery({ tab: tab.key, ...q }),
  });
  const form = filterForm({
    values,
    fields: [{ name: 'status', label: 'สถานะ', as: 'select', options: [ALL, ...STATUS_OPTIONS(tab.kind)] }],
    onSubmit: (v) => list.setQuery(clean(v)),
  });
  replaceContent(panel, form, list.el);
  list.setQuery(clean({ ...values, page: values.page }));
}

for (const tab of TABS) {
  tabBar.append(h('button', {
    type: 'button', role: 'tab', dataset: { tab: tab.key }, 'aria-selected': 'false', onClick: () => selectTab(tab),
  }, tab.label));
}

replaceContent(main, h('h1', null, 'ประวัติ'), tabBar, panel);
selectTab(TABS.find((t) => t.key === query.tab) ?? TABS[0], { status: query.status, page: query.page });
