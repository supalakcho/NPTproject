// ช่องฟอร์ม + ข้อความ error ใต้ช่อง (aria-describedby) + ย้ายโฟกัสไปช่องแรกที่ผิด
import { h } from '../core/dom.js';

/**
 * สร้างช่องฟอร์ม
 * @param {{ name: string, label: string, type?: string, as?: 'input'|'select'|'textarea', value?: string,
 *   hint?: string, options?: {value: string, label: string}[], attrs?: object, idPrefix?: string }} cfg
 * idPrefix ใช้เมื่อมีฟอร์มชนิดเดียวกันหลายอันในหน้าเดียว เพื่อไม่ให้ id ซ้ำ
 */
export function createField({ name, label, type = 'text', as = 'input', value = '', hint, options = [], attrs = {}, idPrefix = '' }) {
  const id = `${idPrefix}f-${name}`;
  const describedBy = [hint && `${id}-hint`, `${id}-err`].filter(Boolean).join(' ');
  const common = { id, name, 'aria-describedby': describedBy, ...attrs };

  let control;
  if (as === 'select') {
    control = h('select', common, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  } else if (as === 'textarea') {
    control = h('textarea', { rows: 3, ...common }, value);
  } else {
    control = h('input', { type, value, ...common });
  }

  return h('div', { class: 'field', dataset: { field: name } },
    h('label', { for: id }, label),
    control,
    hint && h('div', { class: 'field-hint', id: `${id}-hint` }, hint),
    h('div', { class: 'field-error', id: `${id}-err`, role: 'alert', dataset: { errorFor: name } }));
}

export function clearErrors(root) {
  for (const el of root.querySelectorAll('.field-error')) el.textContent = '';
  for (const el of root.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  root.querySelector('.form-error')?.remove();
}

/**
 * วาง error ใต้ช่องตามชื่อ field แล้วโฟกัสช่องแรกที่ผิด
 * error ที่ไม่มีช่องรองรับจะแสดงรวมที่ด้านบนฟอร์ม
 * @param {HTMLElement} root
 * @param {Record<string, string>} errors
 */
export function showErrors(root, errors) {
  clearErrors(root);
  let first = null;
  const orphans = [];
  for (const [name, message] of Object.entries(errors)) {
    const control = root.querySelector(`[name="${name}"]`);
    const slot = root.querySelector(`[data-error-for="${name}"]`);
    if (!control || !slot) {
      orphans.push(message);
      continue;
    }
    slot.textContent = message;
    control.setAttribute('aria-invalid', 'true');
    first ??= control;
  }
  if (orphans.length) {
    root.prepend(h('div', { class: 'form-error', role: 'alert' }, orphans.join(' · ')));
  }
  first?.focus();
  return first;
}

/** อ่านค่าจากฟอร์มเป็น object (ค่าเป็น string ทั้งหมด) */
export function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}
