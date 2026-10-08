// แจ้งเตือน (ใช้ร่วมกันทั้ง 2 role): รายการแบ่งหน้า, กรองยังไม่อ่าน, อ่านทั้งหมด, คลิกแล้วไปหน้าที่เกี่ยวข้อง
import { appUrl } from '../config.js';
import * as api from '../core/api.js';
import { getUser } from '../core/auth.js';
import { h, loadView, replaceContent } from '../core/dom.js';
import { refreshUnread } from '../core/layout.js';
import { startPage } from '../core/page.js';
import { pagination } from '../components/pagination.js';
import { showToast } from '../components/toast.js';
import { formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { readQuery, writeQuery } from '../utils/query.js';

const main = await startPage({ active: 'notifications' });
const isAdmin = getUser()?.roleCode === 'admin';
const state = { page: Number(readQuery().page) || 1, unreadOnly: readQuery().unreadOnly === 'true' };
const listEl = h('div');

/** หน้าที่เกี่ยวข้องกับแจ้งเตือนนั้น */
function targetOf(n) {
  if (n.loanId) return isAdmin ? 'admin/loans.html' : 'member/home.html';
  if (n.reservationId) return isAdmin ? 'admin/reservations.html' : 'member/home.html';
  return null;
}

async function open(n) {
  if (!n.isRead) {
    try {
      await api.markNotificationRead(n.id);
      refreshUnread().catch(() => {});
    } catch (err) {
      presentError(err);
      return;
    }
  }
  const target = targetOf(n);
  if (target) location.assign(appUrl(target));
  else load();
}

function row(n) {
  return h('li', { class: `list-row${n.isRead ? '' : ' unread'}`, dataset: { notificationId: n.id, read: String(n.isRead) } },
    h('button', { class: `notif${n.isRead ? '' : ' unread'}`, type: 'button', onClick: () => open(n) },
      h('span', { class: 'notif-title' }, n.title),
      !n.isRead && h('span', { class: 'badge badge-busy', style: 'margin-left:8px' }, 'ยังไม่อ่าน'),
      h('span', { style: 'display:block' }, n.message),
      h('span', { class: 'muted', style: 'display:block' }, formatDateTime(n.createdAt))));
}

function load() {
  writeQuery({ page: state.page > 1 ? state.page : '', unreadOnly: state.unreadOnly ? 'true' : '' });
  return loadView(listEl,
    () => api.listNotifications({ page: state.page, pageSize: 20, unreadOnly: state.unreadOnly ? 'true' : undefined }),
    ({ data, meta }) => h('div', null,
      data.length
        ? h('ul', { class: 'list-plain' }, data.map(row))
        : h('p', { class: 'empty-state' }, state.unreadOnly ? 'ไม่มีแจ้งเตือนที่ยังไม่อ่าน' : 'ยังไม่มีแจ้งเตือน'),
      pagination({ meta, onChange: (page) => { state.page = page; load(); } })));
}

async function readAll() {
  try {
    const { data } = await api.markAllNotificationsRead();
    showToast(data.updated ? `ทำเครื่องหมายอ่านแล้ว ${data.updated} รายการ` : 'ไม่มีแจ้งเตือนที่ยังไม่อ่าน');
    refreshUnread().catch(() => {});
    await load();
  } catch (err) {
    presentError(err);
  }
}

const filter = h('label', null,
  h('input', {
    type: 'checkbox', checked: state.unreadOnly,
    onChange: (e) => { state.unreadOnly = e.target.checked; state.page = 1; load(); },
  }), ' แสดงเฉพาะที่ยังไม่อ่าน');

replaceContent(main,
  h('div', { class: 'page-head' },
    h('h1', null, 'แจ้งเตือน'),
    h('button', { class: 'btn', type: 'button', onClick: readAll }, 'อ่านทั้งหมด')),
  h('div', { class: 'field-check' }, filter),
  listEl);
await load();
