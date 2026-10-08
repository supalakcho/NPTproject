// ตั้งค่าระบบ (S2, S3): ฟอร์ม 5 ค่า บันทึกครั้งเดียวทั้งหมด (ผิด 1 ตัว ไม่บันทึกเลย)
import * as api from '../core/api.js';
import { h, loadView, runExclusive } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { createField, readForm, showErrors } from '../components/fieldError.js';
import { showToast } from '../components/toast.js';
import { formatDateTime } from '../utils/datetime.js';
import { presentError } from '../utils/errors.js';
import { SETTING_RANGES, validateSettings } from '../utils/validate.js';

const main = await startPage({ role: 'admin', permission: 'setting.manage', active: 'settings' });

function render(settings) {
  const byKey = Object.fromEntries(settings.map((s) => [s.key, s]));
  const form = h('form', { novalidate: true, style: 'max-width:480px' },
    Object.entries(SETTING_RANGES).map(([key, { min, max, label }]) => createField({
      name: key, label, type: 'number', value: String(byKey[key]?.value ?? ''),
      hint: `ใส่ได้ ${min}–${max}${byKey[key]?.updatedAt ? ` · แก้ล่าสุด ${formatDateTime(byKey[key].updatedAt)}` : ''}`,
      attrs: { min, max, step: 1, inputmode: 'numeric' },
    })),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'บันทึกการตั้งค่า'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = readForm(form);
    const { valid, errors } = validateSettings(values);
    if (!valid) {
      showErrors(form, errors); // ไม่บันทึกค่าใดเลย
      return;
    }
    await runExclusive(form.querySelector('button[type="submit"]'), async () => {
      try {
        await api.updateSettings(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])));
        showToast('บันทึกการตั้งค่าแล้ว');
      } catch (err) {
        presentError(err, { form });
      }
    }, 'กำลังบันทึก...');
  });

  return h('div', null, h('h1', null, 'ตั้งค่าระบบ'), form);
}

await loadView(main, () => api.listSettings().then((r) => r.data), render);
