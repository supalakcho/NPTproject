// map error.code -> การกระทำใน UI (ตามตารางข้อ 7 ของ prompt)
import { appUrl } from '../config.js';
import { formatDateTime } from './datetime.js';
import { showToast } from '../components/toast.js';
import { showErrors } from '../components/fieldError.js';

export class ApiError extends Error {
  constructor({ status = 0, code = 'INTERNAL_ERROR', message = 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง', details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const RELOAD_CODES = new Set([
  'NOTEBOOK_ALREADY_BORROWED', 'NOTEBOOK_NOT_AVAILABLE', 'LOAN_STATE_CHANGED',
  'RETURN_ALREADY_REQUESTED', 'LOAN_ALREADY_RETURNED',
]);

function commitmentText(code, d = {}) {
  if (code === 'NOTEBOOK_HAS_COMMITMENTS') {
    const parts = [];
    if (d.activeLoans !== undefined) parts.push(`กำลังยืม ${d.activeLoans} รายการ`);
    if (d.upcomingReservations !== undefined) parts.push(`การจองล่วงหน้า ${d.upcomingReservations} รายการ`);
    return parts.join(' · ');
  }
  if (code === 'BRAND_IN_USE' && d.activeModels !== undefined) return `มีรุ่นที่ใช้ยี่ห้อนี้ ${d.activeModels} รุ่น`;
  if (code === 'MODEL_IN_USE' && d.activeNotebooks !== undefined) return `มีเครื่องที่ใช้รุ่นนี้ ${d.activeNotebooks} เครื่อง`;
  return undefined;
}

/**
 * แปลง error เป็นคำอธิบายการกระทำ (pure ไม่แตะ DOM)
 * @returns {{ message: string, extra?: string, fieldErrors?: Record<string,string>,
 *   action?: { type: 'link'|'setValue', label: string, href?: string, value?: string },
 *   reload?: boolean, retry?: boolean, sessionEnd?: boolean }}
 */
export function classifyError(err) {
  const code = err?.code ?? 'INTERNAL_ERROR';
  const d = err?.details;
  const out = { message: err?.message || 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' };

  switch (code) {
    case 'UNAUTHORIZED':
    case 'ACCOUNT_SUSPENDED':
      out.sessionEnd = true;
      break;
    case 'VALIDATION_ERROR':
      if (Array.isArray(d)) out.fieldErrors = Object.fromEntries(d.map((x) => [x.field, x.message]));
      break;
    case 'OWN_RESERVATION_OVERLAP':
      out.action = { type: 'link', label: 'ไปที่การจองของฉัน', href: 'member/home.html' };
      break;
    case 'RESERVATION_CONFLICT':
      if (d?.availableUntil) {
        out.extra = `ยืมได้ถึง ${formatDateTime(d.availableUntil)}`;
        out.action = { type: 'setValue', label: 'ตั้งเวลาคืนเป็นเวลานี้', value: d.availableUntil };
      }
      break;
    case 'EXTEND_CONFLICT_RESERVATION':
    case 'LOAN_DURATION_EXCEEDED':
      if (d?.maxDueAt) {
        out.extra = `ต่อได้ถึง ${formatDateTime(d.maxDueAt)}`;
        out.action = { type: 'setValue', label: 'ตั้งเวลาคืนเป็นเวลานี้', value: d.maxDueAt };
      }
      break;
    case 'LOAN_LIMIT_REACHED':
      out.action = { type: 'link', label: 'ไปที่เครื่องที่ยืมอยู่', href: 'member/home.html' };
      break;
    case 'NOTEBOOK_HAS_COMMITMENTS':
    case 'BRAND_IN_USE':
    case 'MODEL_IN_USE':
      out.extra = commitmentText(code, d);
      break;
    case 'NETWORK_ERROR':
    case 'INTERNAL_ERROR':
      out.retry = true;
      break;
    default:
      if (RELOAD_CODES.has(code)) out.reload = true;
  }
  return out;
}

/**
 * แสดง error ให้ผู้ใช้ (toast + ปุ่มตามชนิด + error ใต้ช่อง)
 * @param {Error} err
 * @param {{ form?: HTMLElement, onReload?: Function, onRetry?: Function, onSetValue?: (iso: string) => void }} [ctx]
 */
export function presentError(err, ctx = {}) {
  const c = classifyError(err);
  if (c.sessionEnd) return c; // api.js พาไปหน้า login แล้ว

  if (c.fieldErrors && ctx.form) showErrors(ctx.form, c.fieldErrors);

  let action;
  if (c.action?.type === 'link') {
    action = { label: c.action.label, onClick: () => location.assign(appUrl(c.action.href)) };
  } else if (c.action?.type === 'setValue' && ctx.onSetValue) {
    action = { label: c.action.label, onClick: () => ctx.onSetValue(c.action.value) };
  } else if (c.retry && ctx.onRetry) {
    action = { label: 'ลองใหม่', onClick: ctx.onRetry };
  }

  showToast(c.message, { type: 'error', extra: c.extra, action });
  if (c.reload) ctx.onReload?.();
  return c;
}
