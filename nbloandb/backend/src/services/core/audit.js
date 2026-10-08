// เขียน audit_logs จาก ctx (ส่ง conn เมื่ออยู่ใน transaction เพื่อให้ rollback ไปพร้อมกัน)
import { auditLogs } from '../../models/index.js';

/**
 * action ตาม ENUM ใน SQL: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, REGISTER, CREATE, UPDATE, DELETE, PERMISSION_DENIED
 * กู้คืนข้อมูลใช้ UPDATE + newValues.event = 'restore' (ENUM ไม่มี RESTORE)
 * @param {import('./context.js').Ctx} ctx
 * @param {{ action: string, userId?: number|null, targetTable?: string, targetId?: number, oldValues?: object, newValues?: object }} entry
 * @param {{ conn?: import('mysql2/promise').PoolConnection }} [options]
 * @returns {Promise<number>}
 * @example
 * await writeAudit(ctx, { action: 'UPDATE', targetTable: 'loans', targetId: id, newValues: { event: 'extend' } }, { conn });
 */
export function writeAudit(ctx, { userId, ...entry }, options = {}) {
  return auditLogs.insert(
    {
      ...entry,
      userId: userId === undefined ? (ctx.userId ?? null) : userId,
      ipAddress: (ctx.ip || '0.0.0.0').slice(0, 45),
      userAgent: ctx.userAgent ? String(ctx.userAgent).slice(0, 255) : null,
    },
    options,
  );
}

/**
 * old/new เฉพาะ field ที่ค่าเปลี่ยน (Date เทียบด้วยเวลา)
 * @param {object} before
 * @param {object} after
 * @param {string[]} fields
 * @returns {{ oldValues: object, newValues: object }}
 */
export function diff(before, after, fields) {
  const oldValues = {};
  const newValues = {};
  for (const field of fields) {
    const a = before?.[field] ?? null;
    const b = after?.[field] ?? null;
    const same = a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
    if (!same) {
      oldValues[field] = a;
      newValues[field] = b;
    }
  }
  return { oldValues, newValues };
}
