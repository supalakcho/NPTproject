import { appUrl } from '../config.js';
import * as api from '../core/api.js';
import { homePathFor, resolveNext, saveSession } from '../core/auth.js';
import { $, h, replaceContent, runExclusive } from '../core/dom.js';
import { renderPublic } from '../core/layout.js';
import { createField, readForm, showErrors } from '../components/fieldError.js';
import { presentError } from '../utils/errors.js';
import { readQuery } from '../utils/query.js';
import { validateRegister } from '../utils/validate.js';

const query = readQuery();

renderPublic();

const form = h('form', { novalidate: true },
  createField({ name: 'email', label: 'อีเมล', type: 'email', attrs: { autocomplete: 'email', required: true } }),
  createField({
    name: 'password', label: 'รหัสผ่าน', type: 'password', hint: 'อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข',
    attrs: { autocomplete: 'new-password', required: true },
  }),
  createField({ name: 'firstName', label: 'ชื่อ', attrs: { autocomplete: 'given-name', required: true } }),
  createField({ name: 'lastName', label: 'นามสกุล', attrs: { autocomplete: 'family-name', required: true } }),
  createField({ name: 'phone', label: 'เบอร์โทร', type: 'tel', hint: 'เช่น 0812345678', attrs: { autocomplete: 'tel', inputmode: 'numeric', required: true } }),
  createField({ name: 'memberCode', label: 'รหัสสมาชิก (ไม่บังคับ)' }),
  h('button', { class: 'btn btn-primary', type: 'submit' }, 'สมัครสมาชิก'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = readForm(form);
  const { valid, errors } = validateRegister(values);
  if (!valid) {
    showErrors(form, errors);
    return;
  }

  await runExclusive(form.querySelector('button[type="submit"]'), async () => {
    try {
      const memberCode = values.memberCode.trim();
      const { data } = await api.register({
        email: values.email.trim(),
        password: values.password,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim(),
        ...(memberCode ? { memberCode } : {}),
      });
      // สมัครแล้วใช้ token ที่ได้เข้าใช้งานทันที
      saveSession(data);
      location.replace(resolveNext(query.next) ?? appUrl(homePathFor(data.user.roleCode)));
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') showErrors(form, { email: err.message });
      else if (err.code === 'MEMBER_CODE_TAKEN') showErrors(form, { memberCode: err.message });
      else presentError(err, { form });
    }
  }, 'กำลังสมัคร...');
});

replaceContent($('#main'),
  h('h1', null, 'สมัครสมาชิก'),
  form,
  h('p', { style: 'margin-top:16px' }, 'มีบัญชีแล้ว? ', h('a', { href: 'login.html' }, 'เข้าสู่ระบบ')));

form.querySelector('input').focus();
