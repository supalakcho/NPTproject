// ตรวจสิทธิ์จาก ctx.permissions และ cache permission ของแต่ละ role
import { rolePermissions } from '../../models/index.js';
import { AppError } from './AppError.js';
import { writeAudit } from './audit.js';
import { logger } from './logger.js';

// role/permission แก้ผ่าน DB เท่านั้น ต้อง restart เมื่อแก้ seed
const cache = new Map();

/**
 * @param {number} roleId
 * @returns {Promise<Set<string>>}
 */
export async function getPermissions(roleId) {
  if (!cache.has(roleId)) cache.set(roleId, new Set(await rolePermissions.findPermissionCodesByRoleId(roleId)));
  return cache.get(roleId);
}

/** @param {import('./context.js').Ctx} ctx */
export function requireLogin(ctx) {
  if (!ctx?.userId) throw new AppError('UNAUTHORIZED');
}

/** @param {import('./context.js').Ctx} ctx @param {string} code */
export function hasPermission(ctx, code) {
  return Boolean(ctx?.permissions?.has(code));
}

/**
 * ไม่มีสิทธิ์ → เขียน audit PERMISSION_DENIED แล้ว throw FORBIDDEN
 * @param {import('./context.js').Ctx} ctx
 * @param {string} code
 * @example
 * await requirePermission(ctx, PERM.LOAN_CREATE);
 */
export async function requirePermission(ctx, code) {
  requireLogin(ctx);
  if (hasPermission(ctx, code)) return;
  await writeAudit(ctx, { action: 'PERMISSION_DENIED', newValues: { permission: code } }).catch((err) =>
    logger.error('audit PERMISSION_DENIED failed', err),
  );
  throw new AppError('FORBIDDEN');
}
