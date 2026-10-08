// แอดมินจัดการสมาชิก
import { withTransaction, users, roles, loans } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit, diff } from './core/audit.js';
import { requirePermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { userDto } from './core/dto.js';
import { validate, invalid, paging, compact, id as idRule } from './validators/rules.js';
import { USER_LIST, USER_UPDATE } from './validators/admin.validator.js';

const FIELDS = ['roleId', 'memberCode', 'email', 'firstName', 'lastName', 'phone'];
const parseId = (id) => validate({ id }, { id: [idRule] }).id;
const adminDto = (u) => userDto(u, { admin: true });

async function findOr404(id, options = {}) {
  const user = await users.findById(id, options);
  if (!user) throw new AppError('USER_NOT_FOUND');
  return user;
}

// ponytail: ตรวจนอก lock ถ้าแอดมิน 2 คนระงับกันเองพร้อมกันอาจเหลือ 0 คน ถ้ากังวลให้ล็อกแถว roles ก่อนตรวจ
async function assertNotLastAdmin(user, conn) {
  if (user.roleCode !== 'admin' || !user.isActive) return;
  const { total } = await users.list({ roleId: user.roleId, isActive: true, pageSize: 1 }, { conn });
  if (total <= 1) throw new AppError('LAST_ADMIN');
}

export async function list(ctx, filter = {}) {
  await requirePermission(ctx, PERM.USER_VIEW_ALL);
  const { includeDeleted, ...rest } = paging(validate(filter, USER_LIST));
  const result = await users.list(compact(rest), { includeDeleted: Boolean(includeDeleted) });
  return { ...result, rows: result.rows.map(adminDto) };
}

/** รวมบัญชีที่ถูกลบ (เพื่อกู้คืน) + activeLoanCount */
export async function getById(ctx, id) {
  await requirePermission(ctx, PERM.USER_VIEW_ALL);
  const user = await findOr404(parseId(id), { includeDeleted: true });
  return { ...adminDto(user), activeLoanCount: await loans.countActiveByUser(user.id) };
}

/** แก้ roleId, memberCode, email, ชื่อ, เบอร์ · เปลี่ยน role ของแอดมินคนสุดท้าย = LAST_ADMIN */
export async function update(ctx, id, input) {
  await requirePermission(ctx, PERM.USER_UPDATE_ANY);
  const userId = parseId(id);
  const data = validate(input, USER_UPDATE);
  for (const field of ['roleId', 'email', 'firstName', 'lastName', 'phone']) {
    if (data[field] === null) throw invalid(field, 'ต้องระบุ');
  }
  return withTransaction(async (conn) => {
    const before = await findOr404(userId, { conn });
    if (data.email && (await users.isEmailTaken(data.email, { excludeId: userId, conn }))) throw new AppError('EMAIL_TAKEN');
    if (data.memberCode && (await users.isMemberCodeTaken(data.memberCode, { excludeId: userId, conn }))) {
      throw new AppError('MEMBER_CODE_TAKEN');
    }
    if (data.roleId !== undefined && data.roleId !== before.roleId) {
      if (!(await roles.findById(data.roleId, { conn }))) throw invalid('roleId', 'ไม่มี role นี้');
      await assertNotLastAdmin(before, conn);
    }
    const after = await users.update(userId, data, { conn });
    const changes = diff(before, after, FIELDS);
    if (Object.keys(changes.newValues).length) {
      await writeAudit(ctx, { action: 'UPDATE', targetTable: 'users', targetId: userId, ...changes }, { conn });
    }
    return adminDto(after);
  });
}

async function setActive(ctx, id, isActive) {
  await requirePermission(ctx, PERM.USER_UPDATE_ANY);
  const userId = parseId(id);
  if (!isActive && userId === ctx.userId) throw new AppError('CANNOT_MODIFY_SELF');
  return withTransaction(async (conn) => {
    const before = await findOr404(userId, { conn });
    if (!isActive) await assertNotLastAdmin(before, conn);
    const after = await users.update(userId, { isActive }, { conn });
    await writeAudit(
      ctx,
      { action: 'UPDATE', targetTable: 'users', targetId: userId, oldValues: { isActive: before.isActive }, newValues: { event: isActive ? 'activate' : 'suspend', isActive } },
      { conn },
    );
    return adminDto(after);
  });
}

/** ระงับบัญชี (การยืมที่ค้างยังคืนได้ตามปกติ) · ระงับตัวเอง = CANNOT_MODIFY_SELF */
export const suspend = (ctx, id) => setActive(ctx, id, false);
export const activate = (ctx, id) => setActive(ctx, id, true);

/** ห้ามลบตัวเอง/แอดมินคนสุดท้าย/ผู้ที่ยังมีเครื่องไม่คืน */
export async function remove(ctx, id) {
  await requirePermission(ctx, PERM.USER_UPDATE_ANY);
  const userId = parseId(id);
  if (userId === ctx.userId) throw new AppError('CANNOT_MODIFY_SELF');
  return withTransaction(async (conn) => {
    const user = await findOr404(userId, { conn });
    await assertNotLastAdmin(user, conn);
    if ((await loans.countActiveByUser(userId, { conn })) > 0) throw new AppError('USER_HAS_ACTIVE_LOANS');
    await users.softDelete(userId, { conn });
    await writeAudit(ctx, { action: 'DELETE', targetTable: 'users', targetId: userId, oldValues: { email: user.email } }, { conn });
    return null;
  });
}
export { remove as delete };

export async function restore(ctx, id) {
  await requirePermission(ctx, PERM.USER_UPDATE_ANY);
  const userId = parseId(id);
  return withTransaction(async (conn) => {
    if (!(await users.restore(userId, { conn }))) throw new AppError('USER_NOT_FOUND');
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'users', targetId: userId, newValues: { event: 'restore' } }, { conn });
    return adminDto(await users.findById(userId, { conn }));
  });
}
