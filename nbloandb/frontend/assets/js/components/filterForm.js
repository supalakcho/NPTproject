// ฟอร์มตัวกรองของหน้ารายการ: ส่งค่าเป็น query object (ตัดค่าว่างออกที่ผู้เรียก)
import { h } from '../core/dom.js';
import { createField, readForm } from './fieldError.js';

/**
 * @param {{ fields: { name: string, label: string, as?: 'input'|'select', type?: string, options?: {value:string,label:string}[] }[],
 *   values?: Record<string,string>, onSubmit: (values: Record<string,string>) => void, submitLabel?: string }} opts
 * @returns {HTMLFormElement}
 */
export function filterForm({ fields, values = {}, onSubmit, submitLabel = 'ค้นหา' }) {
  const form = h('form', { class: 'filter-form', novalidate: true },
    h('div', { class: 'filter-grid' }, fields.map((f) => {
      if (f.type === 'checkbox') {
        return h('div', { class: 'field field-check' },
          h('label', null, h('input', { type: 'checkbox', name: f.name, value: 'true', checked: values[f.name] === 'true' }), ` ${f.label}`));
      }
      return createField({ ...f, value: values[f.name] ?? '' });
    })),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel),
      h('button', {
        class: 'btn', type: 'button',
        onClick: () => { form.reset(); for (const el of form.querySelectorAll('input:not([type=checkbox]), select')) el.value = ''; onSubmit({}); },
      }, 'ล้างตัวกรอง')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit(readForm(form));
  });
  return form;
}
