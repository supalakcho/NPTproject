// ข้อมูลของฉัน: โปรไฟล์และรหัสผ่าน (ผู้ที่ login แล้วทุกคน)
import { withTransaction, users } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit, diff } from './core/audit.js';
import { requireLogin } from './core/authorize.js';
import { hashPassword, comparePassword } from './core/password.js';
import { userDto } from './core/dto.js';
import { validate, invalid } from './validators/rules.js';
import { UPDATE_ME, CHANGE_PASSWORD } from './validators/auth.validator.js';

const EDITABLE = ['firstName', 'lastName', 'phone', 'avatarPath'];

/** @param {import('./core/context.js').Ctx} ctx @returns {Promise<object>} User + permissions */
export async function getMe(ctx) {
  requireLogin(ctx);
  const user = await users.findById(ctx.userId);
  if (!user) throw new AppError('UNAUTHORIZED');
  return { ...userDto(user), permissions: [...ctx.permissions] };
}

/**
 * แก้ได้เฉพาะ firstName, lastName, phone, avatarPath (อีเมล/รหัสสมาชิกแก้ผ่านแอดมิน)
 * @param {import('./core/context.js').Ctx} ctx
 * @param {{ firstName?, lastName?, phone?, avatarPath? }} input
 */
export async function updateMe(ctx, input) {
  requireLogin(ctx);
  const data = validate(input, UPDATE_ME);
  for (const field of ['firstName', 'lastName', 'phone']) {
    if (data[field] === null) throw invalid(field, 'ต้องระบุ');
  }
  return withTransaction(async (conn) => {
    const before = await users.findById(ctx.userId, { conn });
    if (!before) throw new AppError('UNAUTHORIZED');
    const after = await users.update(ctx.userId, data, { conn });
    const changes = diff(before, after, EDITABLE);
    if (Object.keys(changes.newValues).length) {
      await writeAudit(ctx, { action: 'UPDATE', targetTable: 'users', targetId: ctx.userId, ...changes }, { conn });
    }
    return userDto(after);
  });
}

/**
 * @param {import('./core/context.js').Ctx} ctx
 * @param {{ currentPassword: string, newPassword: string }} input
 */
export async function changePassword(ctx, input) {
  requireLogin(ctx);
  const { currentPassword, newPassword } = validate(input, CHANGE_PASSWORD);
  if (currentPassword === newPassword) throw invalid('newPassword', 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
  const hash = await users.findPasswordHashById(ctx.userId);
  if (!hash || !(await comparePassword(currentPassword, hash))) throw new AppError('CURRENT_PASSWORD_INCORRECT');
  const newHash = await hashPassword(newPassword);
  await withTransaction(async (conn) => {
    await users.updatePassword(ctx.userId, newHash, { conn });
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'users', targetId: ctx.userId, newValues: { event: 'change_password' } }, { conn });
  });
  return null;
}
