// ค่าตั้งค่าระบบ
import { withTransaction, settings } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit } from './core/audit.js';
import { requireLogin, requirePermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { getSettings, invalidateSettings } from './core/settingsCache.js';
import { validate, invalid } from './validators/rules.js';
import { SETTING_RANGES, SETTING_SCHEMA } from './validators/admin.validator.js';

const PUBLIC_KEYS = ['maxLoanHours', 'reservationMaxDaysAhead', 'reservationGraceMinutes', 'maxActiveLoansPerUser'];

/** ค่าที่ frontend ใช้จำกัดฟอร์มยืม/จอง/ต่อเวลา */
export async function getPublic(ctx) {
  requireLogin(ctx);
  const all = await getSettings();
  return Object.fromEntries(PUBLIC_KEYS.map((key) => [key, all[key]]));
}

export async function listDetailed(ctx) {
  await requirePermission(ctx, PERM.SETTING_MANAGE);
  return settings.listDetailed();
}

/**
 * บันทึกทุก key ในครั้งเดียว (ผิด 1 ตัว ไม่บันทึกเลย) แล้วล้าง cache
 * @param {import('./core/context.js').Ctx} ctx
 * @param {Record<string, number>} changes เช่น { maxLoanHours: 12 }
 */
export async function update(ctx, changes = {}) {
  await requirePermission(ctx, PERM.SETTING_MANAGE);
  const unknown = Object.keys(changes).filter((key) => !Object.hasOwn(SETTING_RANGES, key));
  if (unknown.length) throw new AppError('UNKNOWN_SETTING', { details: { keys: unknown } });
  const data = validate(changes, SETTING_SCHEMA);
  const entries = Object.entries(data);
  if (!entries.length) throw invalid('settings', 'ต้องระบุอย่างน้อย 1 ค่า');
  const nullKey = entries.find(([, value]) => value === null);
  if (nullKey) throw invalid(nullKey[0], 'ต้องระบุ');

  await withTransaction(async (conn) => {
    for (const [key, value] of entries) {
      const old = await settings.get(key, { conn });
      await settings.set(key, value, { updatedBy: ctx.userId }, { conn });
      await writeAudit(ctx, { action: 'UPDATE', targetTable: 'settings', oldValues: { [key]: old }, newValues: { [key]: value } }, { conn });
    }
  });
  invalidateSettings();
  return settings.listDetailed();
}
