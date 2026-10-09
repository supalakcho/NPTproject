// วาด header, เมนูตาม role/permission, กระดิ่งแจ้งเตือน
import { POLL_INTERVAL_MS, USE_MOCK, appUrl } from '../config.js';
import { h, replaceContent } from './dom.js';
import * as auth from './auth.js';
import * as api from './api.js';

const MEMBER_NAV = [
  { key: 'home', label: 'หน้าแรก', href: 'member/home.html' },
  { key: 'notebooks', label: 'ค้นหา', href: 'member/notebooks.html' },
  { key: 'history', label: 'ประวัติ', href: 'member/history.html' },
  { key: 'profile', label: 'โปรไฟล์', href: 'profile.html' },
];

const ADMIN_NAV = [
  { key: 'returns', label: 'รอรับคืน', href: 'admin/returns.html', permission: 'loan.receive' },
  { key: 'notebooks', label: 'เครื่อง', href: 'admin/notebooks.html', permission: 'notebook.update' },
  { key: 'models', label: 'รุ่น', href: 'admin/models.html', permission: 'model.manage' },
  { key: 'brands', label: 'ยี่ห้อ', href: 'admin/brands.html', permission: 'brand.manage' },
  { key: 'loans', label: 'การยืม', href: 'admin/loans.html', permission: 'loan.view_all' },
  { key: 'reservations', label: 'การจอง', href: 'admin/reservations.html', permission: 'reservation.view_all' },
  { key: 'users', label: 'สมาชิก', href: 'admin/users.html', permission: 'user.view_all' },
  { key: 'reports', label: 'รายงาน', href: 'admin/reports.html', permission: 'report.view' },
  { key: 'settings', label: 'ตั้งค่า', href: 'admin/settings.html', permission: 'setting.manage' },
  { key: 'audit-logs', label: 'Audit Log', href: 'admin/audit-logs.html', permission: 'audit.view' },
  { key: 'profile', label: 'โปรไฟล์', href: 'profile.html' },
];

/** เมนูที่ผู้ใช้เห็น: สมาชิก 4 เมนู, แอดมินตาม permissions (pure) */
export function buildNavItems(roleCode, permissions = []) {
  if (roleCode === 'admin') return ADMIN_NAV.filter((i) => !i.permission || permissions.includes(i.permission));
  return MEMBER_NAV;
}

/**
 * เรียก fn ทันทีและซ้ำทุก intervalMs หยุดเมื่อ tab ถูกซ่อน และเรียกใหม่เมื่อกลับมา
 * @returns {() => void} ฟังก์ชันหยุด
 */
export function startPolling(fn, intervalMs = POLL_INTERVAL_MS, doc = document) {
  let timer = null;
  const run = () => {
    try {
      Promise.resolve(fn()).catch(() => {});
    } catch {
      /* polling ล้มเหลวได้ ไม่ต้องรบกวนผู้ใช้ */
    }
  };
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const startTimer = () => { stopTimer(); timer = setInterval(run, intervalMs); };
  const onVisibility = () => {
    if (doc.hidden) stopTimer();
    else { run(); startTimer(); }
  };

  doc.addEventListener('visibilitychange', onVisibility);
  run();
  if (!doc.hidden) startTimer();
  return () => { stopTimer(); doc.removeEventListener('visibilitychange', onVisibility); };
}

let bellCount = null;

export function setUnreadCount(n) {
  if (!bellCount) return;
  bellCount.textContent = n > 0 ? String(n) : '';
  bellCount.hidden = n <= 0;
  bellCount.parentElement.setAttribute('aria-label', n > 0 ? `แจ้งเตือน ยังไม่อ่าน ${n} รายการ` : 'แจ้งเตือน');
}

export async function refreshUnread() {
  const { data } = await api.getUnreadCount();
  setUnreadCount(data.count);
}

/** ชื่อผู้ใช้ + บทบาท ลิงก์ไปโปรไฟล์ (ข้อความล้วน มือถือแสดงเฉพาะชื่อจริง) */
function userLabel(user) {
  if (!user) return null;
  const full = `${user.firstName} ${user.lastName}`.trim();
  return h('a', { class: 'user-label', href: appUrl('profile.html'), 'aria-label': `${full} (${user.roleName}) ไปที่โปรไฟล์`, title: full },
    h('span', { class: 'user-name' }, h('span', { class: 'user-first' }, user.firstName), h('span', { class: 'user-last' }, ` ${user.lastName}`)),
    h('span', { class: 'user-role' }, user.roleName));
}

function mockBanner() {
  return USE_MOCK ? h('div', { class: 'mock-banner', role: 'note' }, 'โหมดทดสอบ (ข้อมูลจำลอง)') : null;
}

/** header แบบไม่ต้อง login (หน้า login/register) */
export function renderPublic() {
  const header = document.getElementById('app-header');
  if (header) replaceContent(header, mockBanner());
}

export async function logout() {
  try {
    await api.logout();
  } catch {
    /* ลบ session ไม่ว่า request จะสำเร็จหรือไม่ */
  }
  auth.clearSession();
  location.replace(appUrl('login.html'));
}

/**
 * @param {{ active: string }} opts  key ของเมนูที่กำลังเปิดอยู่
 */
export function render({ active } = {}) {
  const session = auth.getSession();
  const roleCode = session?.user?.roleCode ?? 'member';
  const items = buildNavItems(roleCode, session?.permissions);

  bellCount = h('span', { class: 'bell-count', hidden: true });
  const bell = h('a', { class: 'bell', href: appUrl('notifications.html'), 'aria-label': 'แจ้งเตือน' }, 'แจ้งเตือน', bellCount);

  const header = document.getElementById('app-header');
  replaceContent(header,
    mockBanner(),
    h('div', { class: 'app-bar' },
      h('a', { class: 'brand', href: appUrl(auth.homePathFor(roleCode)) }, 'ยืมคืนโน๊ตบุ๊ค'),
      h('div', { class: 'app-bar-end' }, userLabel(session?.user), bell, h('button', { class: 'btn-link', type: 'button', onClick: logout }, 'ออกจากระบบ'))));

  document.querySelector('nav.nav')?.remove();
  const nav = h('nav', { class: roleCode === 'admin' ? 'nav nav-scroll' : 'nav', 'aria-label': 'เมนูหลัก' },
    items.map((i) => h('a', { href: appUrl(i.href), 'aria-current': i.key === active ? 'page' : null }, i.label)));
  document.body.append(nav);
  document.body.classList.add('has-nav');
  document.getElementById('main')?.classList.add('app-main');

  startPolling(refreshUnread);
}
