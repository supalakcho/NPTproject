// schema ของ auth และโปรไฟล์
import { required, optional, str, email, NAME, PHONE, PASSWORD } from './rules.js';

export const REGISTER = {
  email: [required, str({ max: 255 }), email],
  password: PASSWORD,
  firstName: NAME,
  lastName: NAME,
  phone: PHONE,
  memberCode: [optional, str({ max: 30 })],
};

export const LOGIN = {
  email: [required, str({ max: 255 }), (v) => v.toLowerCase()],
  password: [required, (v) => String(v)],
};

export const UPDATE_ME = {
  firstName: [optional, ...NAME],
  lastName: [optional, ...NAME],
  phone: [optional, ...PHONE],
  avatarPath: [optional, str({ max: 255 })],
};

export const CHANGE_PASSWORD = {
  currentPassword: [required, (v) => String(v)],
  newPassword: PASSWORD,
};
