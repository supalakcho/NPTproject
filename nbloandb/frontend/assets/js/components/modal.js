// modal: กักโฟกัสไว้ข้างใน, กด Esc ปิด, คืนโฟกัสให้ปุ่มเดิมเมื่อปิด
import { h } from '../core/dom.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let counter = 0;

/**
 * @param {{ title: string, content: Node | string, actions?: { label: string, variant?: 'primary'|'danger', onClick: (api) => void, disabled?: boolean }[], onClose?: () => void }} opts
 * @returns {{ el: HTMLElement, body: HTMLElement, buttons: HTMLButtonElement[], close: () => void }}
 */
export function openModal({ title, content, actions = [], onClose }) {
  const opener = document.activeElement;
  const titleId = `modal-title-${++counter}`;

  const buttons = actions.map((a) => h('button', {
    type: 'button',
    class: `btn${a.variant ? ` btn-${a.variant}` : ''}`,
    disabled: a.disabled,
    onClick: () => a.onClick(api),
  }, a.label));

  const body = h('div', { class: 'modal-body' }, content);
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('h2', { id: titleId }, title),
    body,
    buttons.length ? h('div', { class: 'modal-actions' }, buttons) : null);
  const el = h('div', { class: 'modal-backdrop' }, dialog);

  function close() {
    el.remove();
    document.removeEventListener('keydown', onKeydown, true);
    if (opener instanceof HTMLElement) opener.focus();
    onClose?.();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = [...dialog.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  }

  const api = { el, body, buttons, close };
  document.body.append(el);
  document.addEventListener('keydown', onKeydown, true);
  (dialog.querySelector('input, select, textarea') ?? dialog.querySelector(FOCUSABLE))?.focus();
  return api;
}
