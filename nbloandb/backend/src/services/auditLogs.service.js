// ดู Audit Log (อ่านอย่างเดียว)
import { auditLogs, users } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { requirePermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { validate, invalid, paging, compact, id as idRule } from './validators/rules.js';
import { AUDIT_LIST } from './validators/admin.validator.js';

// เติม userFullName (ผู้ใช้ต่างกันในหน้าเดียวมีไม่เกิน pageSize คน)
async function withNames(rows) {
  const names = new Map();
  for (const userId of new Set(rows.map((r) => r.userId).filter(Boolean))) {
    const u = await users.findById(userId, { includeDeleted: true });
    names.set(userId, u ? `${u.firstName} ${u.lastName}` : null);
  }
  return rows.map((r) => ({ ...r, userFullName: names.get(r.userId) ?? null }));
}

/** ใหม่สุดก่อน · from ต้องไม่หลัง to */
export async function list(ctx, filter = {}) {
  await requirePermission(ctx, PERM.AUDIT_VIEW);
  const data = compact(paging(validate(filter, AUDIT_LIST)));
  if (data.from && data.to && data.from > data.to) throw invalid('from', 'from ต้องไม่หลัง to');
  const result = await auditLogs.list(data);
  return { ...result, rows: await withNames(result.rows) };
}

export async function getById(ctx, id) {
  await requirePermission(ctx, PERM.AUDIT_VIEW);
  const log = await auditLogs.findById(validate({ id }, { id: [idRule] }).id);
  if (!log) throw new AppError('AUDIT_LOG_NOT_FOUND');
  return (await withNames([log]))[0];
}
