// Validation ฝั่ง frontend: ช่วยผู้ใช้เท่านั้น backend เป็นผู้ตัดสิน
// ทุกฟังก์ชันเป็น pure function รับ `now` เป็น parameter คืน { valid, errors }
import { formatDateTime, toMs } from './datetime.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{9}$/;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const SETTING_RANGES = {
  maxLoanHours: { min: 1, max: 24, label: 'ระยะเวลายืมสูงสุด (ชั่วโมง)' },
  reservationMaxDaysAhead: { min: 1, max: 30, label: 'จองล่วงหน้าได้ไม่เกิน (วัน)' },
  reservationGraceMinutes: { min: 5, max: 120, label: 'เวลาผ่อนผันรับเครื่อง (นาที)' },
  reminderBeforeMinutes: { min: 5, max: 240, label: 'แจ้งเตือนก่อนครบกำหนด (นาที)' },
  maxActiveLoansPerUser: { min: 1, max: 5, label: 'ยืมพร้อมกันได้สูงสุด (เครื่อง)' },
};

const result = (errors) => ({ valid: Object.keys(errors).length === 0, errors });
const text = (v) => (v ?? '').toString().trim();
const required = (v) => text(v).length > 0;

function checkLength(errors, field, value, min, max, label) {
  const n = text(value).length;
  if (n < min) errors[field] = `กรุณากรอก${label}`;
  else if (n > max) errors[field] = `${label}ต้องไม่เกิน ${max} ตัวอักษร`;
}

function checkRange(errors, field, value, min, max, label, { integer = false } = {}) {
  const raw = text(value);
  const n = Number(raw);
  if (raw === '' || Number.isNaN(n)) errors[field] = `กรุณากรอก${label}`;
  else if (integer && !Number.isInteger(n)) errors[field] = `${label}ต้องเป็นจำนวนเต็ม`;
  else if (n < min || n > max) errors[field] = `${label}ต้องอยู่ระหว่าง ${min}–${max}`;
}

/** นโยบายรหัสผ่าน: ≥ 8 ตัว มีทั้งตัวอักษรและตัวเลข */
export function passwordPolicyError(password) {
  const p = password ?? '';
  if (p.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว';
  if (!/\p{L}/u.test(p) || !/\d/.test(p)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  return null;
}

function emailError(email) {
  const e = text(email);
  if (!e) return 'กรุณากรอกอีเมล';
  if (e.length > 255) return 'อีเมลต้องไม่เกิน 255 ตัวอักษร';
  if (!EMAIL_RE.test(e)) return 'รูปแบบอีเมลไม่ถูกต้อง';
  return null;
}

export function validateRegister(v) {
  const errors = {};
  const em = emailError(v.email);
  if (em) errors.email = em;
  const pw = passwordPolicyError(v.password);
  if (pw) errors.password = pw;
  checkLength(errors, 'firstName', v.firstName, 1, 100, 'ชื่อ');
  checkLength(errors, 'lastName', v.lastName, 1, 100, 'นามสกุล');
  if (!PHONE_RE.test(text(v.phone))) errors.phone = 'เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0';
  if (required(v.memberCode)) checkLength(errors, 'memberCode', v.memberCode, 1, 30, 'รหัสสมาชิก');
  return result(errors);
}

export function validateLogin(v) {
  const errors = {};
  if (!required(v.email)) errors.email = 'กรุณากรอกอีเมล';
  if (!(v.password ?? '').length) errors.password = 'กรุณากรอกรหัสผ่าน';
  return result(errors);
}

export function validateProfile(v) {
  const errors = {};
  checkLength(errors, 'firstName', v.firstName, 1, 100, 'ชื่อ');
  checkLength(errors, 'lastName', v.lastName, 1, 100, 'นามสกุล');
  if (!PHONE_RE.test(text(v.phone))) errors.phone = 'เบอร์โทรต้องมี 10 หลัก ขึ้นต้นด้วย 0';
  return result(errors);
}

export function validateChangePassword(v) {
  const errors = {};
  if (!(v.currentPassword ?? '').length) errors.currentPassword = 'กรุณากรอกรหัสผ่านปัจจุบัน';
  const pw = passwordPolicyError(v.newPassword);
  if (pw) errors.newPassword = pw;
  else if (v.newPassword === v.currentPassword) errors.newPassword = 'รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม';
  if (v.confirmPassword !== v.newPassword) errors.confirmPassword = 'ช่องยืนยันรหัสผ่านไม่ตรงกัน';
  return result(errors);
}

/** ยืมทันที: dueAt เป็น ISO */
export function validateBorrow({ dueAt }, { now, settings }) {
  const errors = {};
  const n = toMs(now);
  if (!dueAt) errors.dueAt = 'กรุณาเลือกเวลาคืน';
  else {
    const due = toMs(dueAt);
    if (Number.isNaN(due)) errors.dueAt = 'เวลาคืนไม่ถูกต้อง';
    else if (due <= n) errors.dueAt = 'เวลาคืนต้องเป็นเวลาในอนาคต';
    else if (due - n > settings.maxLoanHours * HOUR) errors.dueAt = `ยืมได้ไม่เกิน ${settings.maxLoanHours} ชั่วโมง`;
  }
  return result(errors);
}

/** ต่อเวลา: dueAt = กำหนดคืนเดิม, maxExtendDueAt จาก loan.actions */
export function validateExtend({ newDueAt }, { dueAt, maxExtendDueAt }) {
  const errors = {};
  if (!newDueAt) errors.newDueAt = 'กรุณาเลือกเวลาคืนใหม่';
  else if (toMs(newDueAt) <= toMs(dueAt)) errors.newDueAt = 'เวลาคืนใหม่ต้องหลังกำหนดคืนเดิม';
  else if (maxExtendDueAt && toMs(newDueAt) > toMs(maxExtendDueAt)) {
    errors.newDueAt = `ต่อเวลาได้ไม่เกิน ${formatDateTime(maxExtendDueAt)}`;
  }
  return result(errors);
}

export function validateReservation({ startAt, endAt }, { now, settings }) {
  const errors = {};
  const n = toMs(now);
  if (!startAt) errors.startAt = 'กรุณาเลือกเวลาเริ่ม';
  else if (toMs(startAt) <= n) errors.startAt = 'เวลาเริ่มต้องเป็นเวลาในอนาคต';
  else if (toMs(startAt) > n + settings.reservationMaxDaysAhead * DAY) {
    errors.startAt = `จองล่วงหน้าได้ไม่เกิน ${settings.reservationMaxDaysAhead} วัน`;
  }

  if (!endAt) errors.endAt = 'กรุณาเลือกเวลาสิ้นสุด';
  else if (startAt && toMs(endAt) <= toMs(startAt)) errors.endAt = 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม';
  else if (startAt && toMs(endAt) - toMs(startAt) > settings.maxLoanHours * HOUR) {
    errors.endAt = `จองได้ไม่เกิน ${settings.maxLoanHours} ชั่วโมงต่อครั้ง`;
  }
  return result(errors);
}

/** แอดมินยืนยันรับคืน */
export function validateConfirmReturn({ returnCondition, returnNote, returnRequestedAt }, { now, borrowedAt }) {
  const errors = {};
  if (!['normal', 'damaged'].includes(returnCondition)) errors.returnCondition = 'กรุณาเลือกสภาพเครื่อง';
  if (returnCondition === 'damaged') {
    const n = text(returnNote).length;
    if (n < 1) errors.returnNote = 'กรุณาระบุหมายเหตุเมื่อเครื่องเสียหาย';
    else if (n > 500) errors.returnNote = 'หมายเหตุต้องไม่เกิน 500 ตัวอักษร';
  }
  if (returnRequestedAt) {
    const t = toMs(returnRequestedAt);
    if (Number.isNaN(t) || t < toMs(borrowedAt) || t > toMs(now)) {
      errors.returnRequestedAt = 'เวลาที่คืนต้องอยู่ระหว่างเวลายืมถึงปัจจุบัน';
    }
  }
  return result(errors);
}

/** แอดมินยกเลิกรายการยืม/การจอง */
export function validateAdminReason({ reason }) {
  const errors = {};
  if (!required(reason)) errors.reason = 'กรุณาระบุเหตุผล';
  return result(errors);
}

export function validateBrand({ name }) {
  const errors = {};
  checkLength(errors, 'name', name, 1, 100, 'ชื่อยี่ห้อ');
  return result(errors);
}

export function validateModel(v) {
  const errors = {};
  if (!required(v.brandId)) errors.brandId = 'กรุณาเลือกยี่ห้อ';
  checkLength(errors, 'modelName', v.modelName, 1, 100, 'ชื่อรุ่น');
  checkLength(errors, 'cpu', v.cpu, 1, 100, 'CPU');
  checkLength(errors, 'os', v.os, 1, 100, 'ระบบปฏิบัติการ');
  checkRange(errors, 'ramGb', v.ramGb, 1, 256, 'RAM (GB)', { integer: true });
  checkRange(errors, 'storageGb', v.storageGb, 1, 8192, 'พื้นที่จัดเก็บ (GB)', { integer: true });
  checkRange(errors, 'screenInch', v.screenInch, 10, 18, 'ขนาดจอ (นิ้ว)');
  return result(errors);
}

// TODO: spec ไม่ระบุกฎของ field ในเครื่อง (N5) จึงตรวจแค่ความยาวและค่าบังคับเบื้องต้น
export function validateNotebook(v) {
  const errors = {};
  if (!required(v.modelId)) errors.modelId = 'กรุณาเลือกรุ่น';
  checkLength(errors, 'assetCode', v.assetCode, 1, 100, 'รหัสครุภัณฑ์');
  if (required(v.serialNumber)) checkLength(errors, 'serialNumber', v.serialNumber, 1, 100, 'Serial number');
  if (!['normal', 'damaged', 'maintenance', 'retired'].includes(v.conditionStatus)) errors.conditionStatus = 'กรุณาเลือกสภาพเครื่อง';
  if (required(v.purchasedAt) && !/^\d{4}-\d{2}-\d{2}$/.test(v.purchasedAt)) errors.purchasedAt = 'รูปแบบวันที่ไม่ถูกต้อง';
  return result(errors);
}

export function validateSettings(values) {
  const errors = {};
  for (const [key, { min, max, label }] of Object.entries(SETTING_RANGES)) {
    if (!(key in values)) continue;
    checkRange(errors, key, values[key], min, max, label, { integer: true });
  }
  return result(errors);
}

export function validateImage(file) {
  const errors = {};
  if (!file) errors.image = 'กรุณาเลือกไฟล์รูป';
  else if (!IMAGE_TYPES.includes(file.type) || file.size > IMAGE_MAX_BYTES) {
    errors.image = 'ไฟล์ต้องเป็นรูป jpg, png หรือ webp ขนาดไม่เกิน 2 MB';
  }
  return result(errors);
}

/** รายงานรายเดือน (P5): รูปแบบ YYYY-MM, สิ้นสุดไม่ก่อนเริ่ม, ห่างกันไม่เกิน 24 เดือน */
export function validateMonthRange({ fromMonth, toMonth }) {
  const errors = {};
  const re = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const f = re.exec(fromMonth ?? '');
  const t = re.exec(toMonth ?? '');
  if (!f) errors.fromMonth = 'กรุณาเลือกเดือนเริ่ม';
  if (!t) errors.toMonth = 'กรุณาเลือกเดือนสิ้นสุด';
  if (f && t) {
    const span = (Number(t[1]) - Number(f[1])) * 12 + (Number(t[2]) - Number(f[2]));
    if (span < 0) errors.toMonth = 'เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม';
    else if (span > 24) errors.toMonth = 'เลือกช่วงได้ไม่เกิน 24 เดือน';
  }
  return result(errors);
}
