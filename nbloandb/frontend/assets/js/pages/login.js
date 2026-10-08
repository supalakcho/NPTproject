import { appUrl } from '../config.js';
import * as api from '../core/api.js';
import { getSession, homePathFor, isExpired, resolveNext, saveSession, takeFlash } from '../core/auth.js';
import { $, h, replaceContent, runExclusive } from '../core/dom.js';
import { renderPublic } from '../core/layout.js';
import { createField, readForm, showErrors } from '../components/fieldError.js';
import { presentError } from '../utils/errors.js';
import { readQuery } from '../utils/query.js';
import { validateLogin } from '../utils/validate.js';

const query = readQuery();

/** หลัง login: ไปที่ next (เฉพาะ path ในแอป) ไม่งั้นไปหน้าแรกตาม role */
function goAfterLogin(roleCode) {
  location.replace(resolveNext(query.next) ?? appUrl(homePathFor(roleCode)));
}

const existing = getSession();
if (existing && !isExpired()) goAfterLogin(existing.user.roleCode);

renderPublic();

const flash = takeFlash();
const registerHref = `register.html${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}`;

const form = h('form', { novalidate: true },
  createField({ name: 'email', label: 'อีเมล', type: 'email', attrs: { autocomplete: 'username', required: true } }),
  createField({ name: 'password', label: 'รหัสผ่าน', type: 'password', attrs: { autocomplete: 'current-password', required: true } }),
  h('button', { class: 'btn btn-primary', type: 'submit' }, 'เข้าสู่ระบบ'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = readForm(form);
  const { valid, errors } = validateLogin(values);
  if (!valid) {
    showErrors(form, errors);
    return;
  }

  await runExclusive(form.querySelector('button[type="submit"]'), async () => {
    try {
      const { data } = await api.login({ email: values.email.trim(), password: values.password });
      saveSession(data);
      goAfterLogin(data.user.roleCode);
    } catch (err) {
      const c = presentError(err, { form });
      // INVALID_CREDENTIALS / ACCOUNT_SUSPENDED แสดงค้างไว้ในฟอร์มด้วย ไม่ใช่แค่ toast
      if (!c.fieldErrors) showErrors(form, { form: err.message });
    }
  }, 'กำลังเข้าสู่ระบบ...');
});

replaceContent($('#main'),
  h('h1', null, 'เข้าสู่ระบบ'),
  flash && h('div', { class: 'form-error', role: 'alert' }, flash),
  form,
  h('p', { style: 'margin-top:16px' }, 'ยังไม่มีบัญชี? ', h('a', { href: registerHref }, 'สมัครสมาชิก')));

form.querySelector('input').focus();
