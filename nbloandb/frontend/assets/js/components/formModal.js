// modal ฟอร์มเพิ่ม/แก้ไขข้อมูล: validate ฝั่ง frontend -> ส่ง -> วาง error จาก backend ใต้ช่อง
import { h, runExclusive } from '../core/dom.js';
import { presentError } from '../utils/errors.js';
import { createField, readForm, showErrors } from './fieldError.js';
import { openModal } from './modal.js';

/**
 * @param {{ title: string, fields: object[], validate?: (values: Record<string,string>) => { valid: boolean, errors: object },
 *   submitLabel?: string, onSubmit: (values: Record<string,string>, modal: object) => Promise<void>,
 *   errorFields?: Record<string, string>, intro?: Node | string }} opts
 * errorFields: map error.code -> ชื่อช่องที่จะวางข้อความ (เช่น BRAND_NAME_TAKEN -> 'name')
 */
export function openFormModal({ title, fields, validate, submitLabel = 'บันทึก', onSubmit, errorFields = {}, intro }) {
  // prefix กัน id ชนกับช่องตัวกรองของหน้า (label for= จะชี้ผิดช่อง)
  const form = h('form', { novalidate: true }, intro, fields.map((f) => createField({ idPrefix: 'modal-', ...f })));

  async function submit(modal) {
    const values = readForm(form);
    const check = validate?.(values);
    if (check && !check.valid) {
      showErrors(form, check.errors);
      return;
    }
    await runExclusive(modal.buttons[1], async () => {
      try {
        await onSubmit(values, modal);
      } catch (err) {
        if (errorFields[err.code]) showErrors(form, { [errorFields[err.code]]: err.message });
        else presentError(err, { form });
      }
    }, 'กำลังบันทึก...');
  }

  const modal = openModal({
    title,
    content: form,
    actions: [
      { label: 'ยกเลิก', onClick: (m) => m.close() },
      { label: submitLabel, variant: 'primary', onClick: submit },
    ],
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(modal);
  });
  return modal;
}
