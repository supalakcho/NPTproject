// โปรไฟล์ (ใช้ร่วมกันทั้ง 2 role): แก้ชื่อ/นามสกุล/เบอร์/รูป และเปลี่ยนรหัสผ่านเป็นฟอร์มแยก
import { mediaUrl } from '../config.js';
import * as api from '../core/api.js';
import { getSession, updateSession } from '../core/auth.js';
import { h, loadView, runExclusive } from '../core/dom.js';
import { startPage } from '../core/page.js';
import { createField, readForm, showErrors } from '../components/fieldError.js';
import { showToast } from '../components/toast.js';
import { presentError } from '../utils/errors.js';
import { validateChangePassword, validateImage, validateProfile } from '../utils/validate.js';

const main = await startPage({ active: 'profile' });

const loadData = () => api.getMe().then((r) => r.data);

function avatarBlock(user) {
  const src = mediaUrl(user.avatarUrl);
  const holder = h('div');
  const show = (url) => holder.replaceChildren(url
    ? h('img', { class: 'avatar', src: url, alt: 'รูปโปรไฟล์' })
    : h('div', { class: 'avatar', role: 'img', 'aria-label': 'ยังไม่มีรูปโปรไฟล์' }));
  show(src);

  const fileField = createField({
    name: 'image', label: 'เปลี่ยนรูปโปรไฟล์', type: 'file', hint: 'ไฟล์ jpg, png หรือ webp ขนาดไม่เกิน 2 MB',
    attrs: { accept: 'image/jpeg,image/png,image/webp' },
  });
  const button = h('button', { class: 'btn', type: 'button' }, 'อัปโหลดรูป');
  button.addEventListener('click', async () => {
    const file = fileField.querySelector('input').files[0];
    const { valid, errors } = validateImage(file);
    if (!valid) {
      showErrors(fileField, errors);
      return;
    }
    await runExclusive(button, async () => {
      try {
        const { data } = await api.uploadAvatar(file);
        show(mediaUrl(data.avatarUrl));
        showToast('เปลี่ยนรูปโปรไฟล์แล้ว');
      } catch (err) {
        if (err.code === 'INVALID_FILE') showErrors(fileField, { image: err.message });
        else presentError(err);
      }
    }, 'กำลังอัปโหลด...');
  });

  return h('section', { class: 'section' }, h('h2', null, 'รูปโปรไฟล์'), holder, fileField, button);
}

function infoForm(user) {
  const form = h('form', { novalidate: true },
    createField({ name: 'firstName', label: 'ชื่อ', value: user.firstName, attrs: { autocomplete: 'given-name' } }),
    createField({ name: 'lastName', label: 'นามสกุล', value: user.lastName, attrs: { autocomplete: 'family-name' } }),
    createField({ name: 'phone', label: 'เบอร์โทร', type: 'tel', value: user.phone ?? '', attrs: { autocomplete: 'tel', inputmode: 'numeric' } }),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'บันทึกข้อมูล'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = readForm(form);
    const { valid, errors } = validateProfile(values);
    if (!valid) {
      showErrors(form, errors);
      return;
    }
    await runExclusive(form.querySelector('button[type="submit"]'), async () => {
      try {
        const body = Object.fromEntries(['firstName', 'lastName', 'phone'].filter((k) => values[k].trim() !== (user[k] ?? '')).map((k) => [k, values[k].trim()]));
        if (!Object.keys(body).length) {
          showToast('ยังไม่มีข้อมูลที่เปลี่ยน');
          return;
        }
        const { data } = await api.updateMe(body);
        Object.assign(user, data);
        updateSession({ user: { ...getSession().user, ...data } });
        showToast('บันทึกข้อมูลแล้ว');
      } catch (err) {
        presentError(err, { form });
      }
    }, 'กำลังบันทึก...');
  });

  return h('section', { class: 'section' },
    h('h2', null, 'ข้อมูลส่วนตัว'),
    h('dl', { class: 'dl' },
      h('dt', null, 'อีเมล'), h('dd', null, user.email),
      h('dt', null, 'รหัสสมาชิก'), h('dd', null, user.memberCode ?? '-'),
      h('dt', null, 'บทบาท'), h('dd', null, user.roleName)),
    form);
}

function passwordForm() {
  const form = h('form', { novalidate: true },
    createField({ name: 'currentPassword', label: 'รหัสผ่านปัจจุบัน', type: 'password', attrs: { autocomplete: 'current-password' } }),
    createField({
      name: 'newPassword', label: 'รหัสผ่านใหม่', type: 'password', hint: 'อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข',
      attrs: { autocomplete: 'new-password' },
    }),
    createField({ name: 'confirmPassword', label: 'ยืนยันรหัสผ่านใหม่', type: 'password', attrs: { autocomplete: 'new-password' } }),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'เปลี่ยนรหัสผ่าน'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = readForm(form);
    const { valid, errors } = validateChangePassword(values);
    if (!valid) {
      showErrors(form, errors);
      return;
    }
    await runExclusive(form.querySelector('button[type="submit"]'), async () => {
      try {
        await api.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
        form.reset();
        showToast('เปลี่ยนรหัสผ่านแล้ว');
      } catch (err) {
        if (err.code === 'CURRENT_PASSWORD_INCORRECT') showErrors(form, { currentPassword: err.message });
        else presentError(err, { form });
      }
    }, 'กำลังเปลี่ยนรหัสผ่าน...');
  });

  return h('section', { class: 'section' }, h('h2', null, 'เปลี่ยนรหัสผ่าน'), form);
}

await loadView(main, loadData, (user) => h('div', { style: 'max-width:480px' },
  h('h1', null, 'โปรไฟล์'), avatarBlock(user), infoForm(user), passwordForm()));
