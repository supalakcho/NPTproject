// ตัวตรวจ input แบบเบา: schema = { field: [rule, rule, ...] } rule รับค่าแล้วคืนค่าที่แปลงแล้ว หรือ throw ข้อความ
// ใส่ optional เป็น rule แรกเมื่อไม่บังคับ (undefined = ไม่ส่ง, null/'' = ล้างค่า)
import { AppError } from '../core/AppError.js';
import { logger } from '../core/logger.js';

const OPTIONAL = Symbol('optional');
export const optional = OPTIONAL;

class RuleFail extends Error {}
const fail = (message) => {
  throw new RuleFail(message);
};

/**
 * @param {Record<string, unknown>} input
 * @param {Record<string, Array<Function|symbol>>} schema
 * @returns {Record<string, any>} เฉพาะ field ใน schema ที่ส่งมา (optional ที่ไม่ส่งจะไม่มี key)
 * @throws {AppError} VALIDATION_ERROR พร้อม details [{ field, message }]
 * @example
 * const { email } = validate(input, { email: [required, str({ max: 255 }), email] });
 */
export function validate(input, schema) {
  const out = {};
  const details = [];
  for (const [field, rules] of Object.entries(schema)) {
    let value = input?.[field];
    const isOptional = rules[0] === OPTIONAL;
    if (isOptional) {
      if (value === undefined) continue;
      if (value === null || value === '') {
        out[field] = null;
        continue;
      }
    }
    try {
      for (const rule of isOptional ? rules.slice(1) : rules) value = rule(value);
      out[field] = value;
    } catch (err) {
      if (!(err instanceof RuleFail)) throw err;
      details.push({ field, message: err.message });
    }
  }
  if (details.length) {
    logger.warn('validation failed', { details });
    throw new AppError('VALIDATION_ERROR', { details });
  }
  return out;
}

/** throw VALIDATION_ERROR ของ field เดียว (ใช้กับกฎที่ตรวจข้าม field) */
export function invalid(field, message) {
  logger.warn('validation failed', { details: [{ field, message }] });
  return new AppError('VALIDATION_ERROR', { details: [{ field, message }] });
}

export const required = (v) => (v === undefined || v === null || v === '' ? fail('ต้องระบุ') : v);

export const str = ({ min = 1, max } = {}) => (v) => {
  if (typeof v !== 'string') fail('ต้องเป็นข้อความ');
  const s = v.trim();
  if (s.length < min) fail(min === 1 ? 'ต้องระบุ' : `ต้องมีอย่างน้อย ${min} ตัวอักษร`);
  if (max && s.length > max) fail(`ต้องไม่เกิน ${max} ตัวอักษร`);
  return s;
};

export const lower = (v) => v.toLowerCase();
export const upper = (v) => v.toUpperCase();

export const email = (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : fail('รูปแบบอีเมลไม่ถูกต้อง'));

export const pattern = (re, message) => (v) => (re.test(v) ? v : fail(message));

export const int = ({ min, max } = {}) => (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n)) fail('ต้องเป็นจำนวนเต็ม');
  if (min !== undefined && n < min) fail(`ต้องไม่น้อยกว่า ${min}`);
  if (max !== undefined && n > max) fail(`ต้องไม่เกิน ${max}`);
  return n;
};

export const num = ({ min, max } = {}) => (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) fail('ต้องเป็นตัวเลข');
  if (min !== undefined && n < min) fail(`ต้องไม่น้อยกว่า ${min}`);
  if (max !== undefined && n > max) fail(`ต้องไม่เกิน ${max}`);
  return n;
};

export const bool = (v) => {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return fail('ต้องเป็น true หรือ false');
};

export const oneOf = (values) => (v) => (values.includes(v) ? v : fail(`ต้องเป็นค่าใดค่าหนึ่งใน ${values.join(', ')}`));

// ISO 8601 ที่มีเวลา เช่น 2026-10-08T14:30:00+07:00 (ไม่มี offset ถือเป็นเวลาไทย)
export const dateTime = (v) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v)) {
    fail('รูปแบบวันเวลาไม่ถูกต้อง (ISO 8601)');
  }
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(v);
  const d = new Date(hasZone ? v : `${v}+07:00`);
  if (Number.isNaN(d.getTime())) fail('วันเวลาไม่ถูกต้อง');
  d.setMilliseconds(0);
  return d;
};

// YYYY-MM-DD → Date เที่ยงคืนเวลาไทย
export const dateOnly = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
  const utc = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== v) fail('วันที่ไม่ถูกต้อง'); // กัน 2026-02-30
  return new Date(`${v}T00:00:00+07:00`);
};

export const month = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) fail('รูปแบบเดือนต้องเป็น YYYY-MM');
  return v;
};

export const sortOf = (fields) => (v) => {
  const [field, dir = 'asc'] = String(v).split(':');
  if (!fields.includes(field) || !['asc', 'desc'].includes(dir)) fail(`เรียงได้ตาม ${fields.join(', ')} (:asc หรือ :desc)`);
  return `${field}:${dir}`;
};

export const id = int({ min: 1 });

/** schema ของ page / pageSize (ค่าเริ่มต้นใส่ใน paging()) */
export const PAGING = { page: [optional, int({ min: 1 })], pageSize: [optional, int({ min: 1, max: 100 })] };

/** ใส่ค่าเริ่มต้น page = 1, pageSize = 20 */
export const paging = (v) => ({ ...v, page: v.page ?? 1, pageSize: v.pageSize ?? 20 });

/** ตัด key ที่เป็น null ออก (ใช้กับ filter: null = ไม่กรอง) */
export const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

export const PASSWORD = [required, str({ min: 8, max: 72 }), pattern(/^(?=.*[A-Za-z])(?=.*\d)/, 'ต้องมีทั้งตัวอักษรและตัวเลข')];
export const PHONE = [required, pattern(/^0\d{9}$/, 'ต้องขึ้นต้นด้วย 0 ตามด้วยตัวเลข 9 หลัก')];
export const NAME = [required, str({ max: 100 })];
