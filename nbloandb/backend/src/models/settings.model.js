// ตาราง settings: ค่าตั้งค่าระบบ key ฝั่ง JS เป็น camelCase เช่น max_loan_hours → maxLoanHours
import { query, execute } from './core/db.js';
import { camelToSnake, snakeToCamel } from './core/mapper.js';

/** @typedef {number|boolean|string} SettingValue */
/** @typedef {{ key: string, value: SettingValue, valueType: 'int'|'bool'|'string', description: string, updatedBy: number|null, updatedAt: Date }} Setting */
/** @typedef {{ conn?: import('mysql2/promise').PoolConnection }} Options */

const SELECT = 'SELECT setting_key, setting_value, value_type, description, updated_by, updated_at FROM settings';

function parseValue(raw, valueType) {
  if (valueType === 'int') return Number(raw);
  if (valueType === 'bool') return raw === '1' || raw.toLowerCase() === 'true';
  return raw;
}

function formatValue(value, valueType) {
  if (valueType === 'bool') return value === true || value === 1 || value === '1' || value === 'true' ? '1' : '0';
  return String(value);
}

function toSetting(row) {
  return {
    key: snakeToCamel(row.setting_key),
    value: parseValue(row.setting_value, row.value_type),
    valueType: row.value_type,
    description: row.description,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

/**
 * ทุกค่าเป็น object เดียว (service ควร cache ไว้แล้วล้างเมื่อมีการ set)
 * @param {Options} [options]
 * @returns {Promise<Record<string, SettingValue>>}
 * @example
 * const { maxLoanHours, reservationMaxDaysAhead } = await settings.getAll();
 */
export async function getAll(options = {}) {
  const rows = await query(SELECT, [], options);
  return Object.fromEntries(rows.map((row) => [snakeToCamel(row.setting_key), parseValue(row.setting_value, row.value_type)]));
}

/**
 * @param {string} key camelCase เช่น 'maxLoanHours'
 * @param {Options} [options]
 * @returns {Promise<SettingValue|null>} null = ไม่มี key นี้
 * @example
 * const maxLoans = await settings.get('maxActiveLoansPerUser', { conn });
 */
export async function get(key, options = {}) {
  const rows = await query(`${SELECT} WHERE setting_key = ?`, [camelToSnake(key)], options);
  return rows[0] ? parseValue(rows[0].setting_value, rows[0].value_type) : null;
}

/**
 * รายละเอียดทุกค่าสำหรับหน้าตั้งค่าของแอดมิน เรียงตาม key
 * @param {Options} [options]
 * @returns {Promise<Setting[]>}
 * @example
 * const rows = await settings.listDetailed();
 */
export async function listDetailed(options = {}) {
  const rows = await query(`${SELECT} ORDER BY setting_key`, [], options);
  return rows.map(toSetting);
}

/**
 * แก้ค่าของ key ที่มีอยู่แล้ว (ไม่สร้าง key ใหม่) ค่าถูกเก็บเป็น string ตาม value_type
 * @param {string} key camelCase
 * @param {SettingValue} value
 * @param {{ updatedBy: number }} meta updatedBy = id ของแอดมิน
 * @param {Options} [options]
 * @returns {Promise<Setting|null>} null = ไม่มี key นี้
 * @example
 * await settings.set('reminderBeforeMinutes', 45, { updatedBy: adminId });
 */
export async function set(key, value, { updatedBy }, options = {}) {
  const dbKey = camelToSnake(key);
  const rows = await query('SELECT value_type FROM settings WHERE setting_key = ?', [dbKey], options);
  if (!rows[0]) return null;
  await execute(
    'UPDATE settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?',
    [formatValue(value, rows[0].value_type), updatedBy ?? null, dbKey],
    options,
  );
  const [row] = await query(`${SELECT} WHERE setting_key = ?`, [dbKey], options);
  return toSetting(row);
}
