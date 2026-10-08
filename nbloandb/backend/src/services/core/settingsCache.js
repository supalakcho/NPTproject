// อ่าน settings แบบ cache 60 วินาที (ใน transaction ให้ใช้ settings.get(key, { conn }) ตรงๆ)
import { settings } from '../../models/index.js';

const TTL_MS = 60_000;
let cached = null;
let loadedAt = 0;

/** @returns {Promise<Record<string, number|boolean|string>>} key เป็น camelCase เช่น maxLoanHours */
export async function getSettings() {
  if (!cached || Date.now() - loadedAt > TTL_MS) {
    cached = await settings.getAll();
    loadedAt = Date.now();
  }
  return cached;
}

export function invalidateSettings() {
  cached = null;
}

/**
 * อ่านค่าเดียวใน transaction (ได้ค่าล่าสุดเสมอ)
 * @param {string} key
 * @param {import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<number>}
 */
export async function getSettingIn(key, conn) {
  const value = await settings.get(key, { conn });
  if (value === null) throw new Error(`Missing setting "${key}"`);
  return value;
}
