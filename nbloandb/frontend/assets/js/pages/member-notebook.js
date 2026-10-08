// รายละเอียดเครื่อง (?id=7): สเปก + ยืมทันที (L1) + จองล่วงหน้า (R1)
import { appUrl, mediaUrl } from '../config.js';
import * as api from '../core/api.js';
import { nowMs } from '../core/clock.js';
import { h, loadView, runExclusive } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { dateTimeField, dateTimeRange, getIsoValue, setIsoValue } from '../components/dateTimeRange.js';
import { showErrors } from '../components/fieldError.js';
import { openModal } from '../components/modal.js';
import { statusBadge } from '../components/statusBadge.js';
import { showToast } from '../components/toast.js';
import { formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { readQuery } from '../utils/query.js';
import { validateBorrow, validateReservation } from '../utils/validate.js';

const main = await startPage({ role: 'member', active: 'notebooks' });
const id = readQuery().id;
const HOUR = 3600_000;

async function loadData() {
  const [nb, settings, mine] = await Promise.all([
    api.getNotebook(id), api.getPublicSettings(),
    Promise.all(['borrowing', 'overdue', 'return_pending'].map((status) => api.listMyLoans({ status, pageSize: 1 }))),
  ]);
  return { notebook: nb.data, settings: settings.data, activeLoans: mine.reduce((sum, r) => sum + r.meta.total, 0) };
}

const refresh = () => loadView(main, loadData, render);

/** ปิด modal แล้วโหลดข้อมูลหน้าใหม่ (ใช้เมื่อสถานะเครื่องเปลี่ยนระหว่างที่ผู้ใช้กรอกฟอร์ม) */
const reloadAfter = (modal) => () => { modal.close(); refresh(); };

function openBorrow(notebook, settings) {
  const now = nowMs();
  const max = new Date(now + settings.maxLoanHours * HOUR).toISOString();
  const body = h('div', null,
    dateTimeField({
      name: 'dueAt', label: 'เวลาคืน', min: new Date(now).toISOString(), max,
      value: new Date(now + Math.min(2, settings.maxLoanHours) * HOUR).toISOString(),
      hint: `ยืมได้ไม่เกิน ${settings.maxLoanHours} ชั่วโมง (ถึง ${formatDateTime(max)})`,
    }));

  const modal = openModal({
    title: `ยืม ${notebook.assetCode}`,
    content: body,
    actions: [
      { label: 'ยกเลิก', onClick: (m) => m.close() },
      {
        label: 'ยืนยันยืม',
        variant: 'primary',
        onClick: async (m) => {
          const dueAt = getIsoValue(body, 'dueAt');
          const { valid, errors } = validateBorrow({ dueAt }, { now: nowMs(), settings });
          if (!valid) {
            showErrors(body, errors);
            return;
          }
          await runExclusive(m.buttons[1], async () => {
            try {
              await api.borrowNow({ notebookId: notebook.id, dueAt });
              showToast('ยืมเครื่องแล้ว');
              location.assign(appUrl('member/home.html'));
            } catch (err) {
              presentError(err, {
                form: body,
                onSetValue: (iso) => setIsoValue(body, 'dueAt', iso),
                onReload: reloadAfter(m),
              });
            }
          }, 'กำลังยืม...');
        },
      },
    ],
  });
}

function openReserve(notebook, settings) {
  const now = nowMs();
  const range = dateTimeRange({
    startLabel: 'เริ่มใช้งาน', endLabel: 'สิ้นสุด', min: new Date(now).toISOString(),
    max: new Date(now + settings.reservationMaxDaysAhead * 24 * HOUR + settings.maxLoanHours * HOUR).toISOString(),
  });
  const body = h('div', null,
    h('p', { class: 'muted' }, `จองล่วงหน้าได้ไม่เกิน ${settings.reservationMaxDaysAhead} วัน ครั้งละไม่เกิน ${settings.maxLoanHours} ชั่วโมง`),
    range.el);

  openModal({
    title: `จอง ${notebook.assetCode}`,
    content: body,
    actions: [
      { label: 'ยกเลิก', onClick: (m) => m.close() },
      {
        label: 'ยืนยันจอง',
        variant: 'primary',
        onClick: async (m) => {
          const { startAt, endAt } = range.getValue();
          const { valid, errors } = validateReservation({ startAt, endAt }, { now: nowMs(), settings });
          if (!valid) {
            showErrors(body, errors);
            return;
          }
          await runExclusive(m.buttons[1], async () => {
            try {
              await api.createReservation({ notebookId: notebook.id, startAt, endAt });
              showToast('จองเครื่องแล้ว');
              location.assign(appUrl('member/home.html'));
            } catch (err) {
              presentError(err, { form: body, onReload: reloadAfter(m) });
            }
          }, 'กำลังจอง...');
        },
      },
    ],
  });
}

function render({ notebook: nb, settings, activeLoans }) {
  const limitReached = activeLoans >= settings.maxActiveLoansPerUser;
  const canBorrow = nb.currentStatus === 'available';
  // จองได้เมื่อสภาพเครื่องพร้อมใช้ (สมาชิกไม่เห็น conditionStatus จึงดูจากสถานะที่ไม่ใช่เสียหาย/ซ่อม/ปลดระวาง)
  const canReserve = ['available', 'borrowed', 'reserved'].includes(nb.currentStatus);
  const img = mediaUrl(nb.imageUrl);

  return h('div', null,
    h('p', null, h('a', { href: appUrl('member/notebooks.html') }, '← กลับไปค้นหาเครื่อง')),
    h('h1', null, `${nb.assetCode} `, statusBadge('notebook', nb.currentStatus)),
    img && h('img', { src: img, alt: `${nb.brandName} ${nb.modelName}`, style: 'max-height:200px' }),
    h('dl', { class: 'dl' },
      h('dt', null, 'ยี่ห้อ'), h('dd', null, nb.brandName),
      h('dt', null, 'รุ่น'), h('dd', null, nb.modelName),
      h('dt', null, 'CPU'), h('dd', null, nb.cpu),
      h('dt', null, 'RAM'), h('dd', null, `${nb.ramGb} GB`),
      h('dt', null, 'พื้นที่จัดเก็บ'), h('dd', null, `${nb.storageGb} GB`),
      h('dt', null, 'ขนาดจอ'), h('dd', null, `${nb.screenInch} นิ้ว`),
      h('dt', null, 'ระบบปฏิบัติการ'), h('dd', null, nb.os)),
    canBorrow && limitReached && h('p', { class: 'notice', id: 'borrow-reason' },
      `คุณยืมครบ ${settings.maxActiveLoansPerUser} เครื่องแล้ว กรุณาคืนเครื่องที่ยืมอยู่ก่อนจึงจะยืมเครื่องนี้ได้`),
    h('div', { class: 'btn-row' },
      canBorrow && h('button', {
        class: 'btn btn-primary', type: 'button', disabled: limitReached, 'aria-describedby': limitReached ? 'borrow-reason' : null,
        onClick: () => openBorrow(nb, settings),
      }, 'ยืมทันที'),
      canReserve && h('button', { class: 'btn', type: 'button', onClick: () => openReserve(nb, settings) }, 'จองล่วงหน้า'),
      !canBorrow && !canReserve && h('p', { class: 'muted' }, 'เครื่องนี้ยังไม่พร้อมให้ยืมหรือจอง')));
}

await refresh();
