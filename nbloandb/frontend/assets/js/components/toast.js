import { h } from '../core/dom.js';

function region() {
  let el = document.getElementById('toast-region');
  if (!el) {
    el = h('div', { id: 'toast-region', 'aria-live': 'polite' });
    document.body.append(el);
  }
  return el;
}

/**
 * @param {string} message
 * @param {{ type?: 'info'|'error', extra?: string, action?: { label: string, onClick: Function }, timeout?: number }} [opts]
 * timeout = 0 คือไม่ปิดเอง (ใช้เมื่อมีปุ่มให้กด)
 */
export function showToast(message, { type = 'info', extra, action, timeout } = {}) {
  const ms = timeout ?? (action ? 0 : 5000);
  const toast = h('div', { class: type === 'error' ? 'toast toast-error' : 'toast', role: type === 'error' ? 'alert' : 'status' },
    h('div', null, message),
    extra && h('div', null, extra),
    action && h('button', {
      class: 'btn', type: 'button',
      onClick: () => { toast.remove(); action.onClick(); },
    }, action.label));
  region().append(toast);
  if (ms > 0) setTimeout(() => toast.remove(), ms);
  return toast;
}
