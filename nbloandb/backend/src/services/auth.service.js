// สมัครสมาชิก, login, logout และตรวจ token ให้ middleware
import { withTransaction, users, roles } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit } from './core/audit.js';
import { getPermissions } from './core/authorize.js';
import { hashPassword, comparePassword } from './core/password.js';
import { signToken, verifyToken } from './core/token.js';
import { userDto } from './core/dto.js';
import { now } from './core/clock.js';
import { validate } from './validators/rules.js';
import { REGISTER, LOGIN } from './validators/auth.validator.js';

async function session(user) {
  const { token, expiresAt } = signToken({ userId: user.id, roleId: user.roleId, roleCode: user.roleCode });
  return { token, expiresAt, user: userDto(user), permissions: [...(await getPermissions(user.roleId))] };
}

/**
 * สมัครสมาชิก ใช้งานได้ทันที
 * @param {import('./core/context.js').Ctx} ctx
 * @param {{ email, password, firstName, lastName, phone, memberCode? }} input
 * @returns {Promise<{ token: string, expiresAt: Date, user: object, permissions: string[] }>}
 */
export async function register(ctx, input) {
  const data = validate(input, REGISTER);
  if (await users.isEmailTaken(data.email)) throw new AppError('EMAIL_TAKEN');
  if (data.memberCode && (await users.isMemberCodeTaken(data.memberCode))) throw new AppError('MEMBER_CODE_TAKEN');
  const role = await roles.findByCode('member');
  if (!role) throw new Error('Role "member" not found in seed');
  const passwordHash = await hashPassword(data.password);

  const user = await withTransaction(async (conn) => {
    const { password, ...profile } = data;
    const created = await users.insert({ ...profile, memberCode: profile.memberCode ?? undefined, roleId: role.id, passwordHash }, { conn });
    await writeAudit(ctx, { action: 'REGISTER', userId: created.id, targetTable: 'users', targetId: created.id }, { conn });
    return created;
  });
  return session(user);
}

/**
 * อีเมลผิดหรือรหัสผิดได้ INVALID_CREDENTIALS เหมือนกัน
 * @param {import('./core/context.js').Ctx} ctx
 * @param {{ email: string, password: string }} input
 */
export async function login(ctx, input) {
  const { email, password } = validate(input, LOGIN);
  const auth = await users.findAuthByEmail(email);
  if (!auth || !(await comparePassword(password, auth.passwordHash))) {
    await writeAudit(ctx, { action: 'LOGIN_FAILED', userId: auth?.id ?? null, newValues: { email } });
    throw new AppError('INVALID_CREDENTIALS');
  }
  if (!auth.isActive) {
    await writeAudit(ctx, { action: 'LOGIN_FAILED', userId: auth.id, newValues: { email, reason: 'suspended' } });
    throw new AppError('ACCOUNT_SUSPENDED');
  }
  await users.updateLastLogin(auth.id, now());
  await writeAudit(ctx, { action: 'LOGIN_SUCCESS', userId: auth.id });
  return session(await users.findById(auth.id));
}

/** JWT แบบ stateless: บันทึก audit อย่างเดียว frontend ลบ token เอง */
export async function logout(ctx) {
  if (!ctx.userId) throw new AppError('UNAUTHORIZED');
  await writeAudit(ctx, { action: 'LOGOUT' });
  return null;
}

/**
 * ตรวจ token แล้วสร้าง ctx (role จาก DB ไม่ใช่จาก token) บัญชีถูกระงับ/ลบมีผลทันที
 * @param {string|undefined} bearerToken
 * @param {{ ip?: string, userAgent?: string }} req
 * @returns {Promise<import('./core/context.js').Ctx>}
 */
export async function authenticate(bearerToken, { ip, userAgent } = {}) {
  const claims = bearerToken ? verifyToken(bearerToken) : null;
  if (!claims) throw new AppError('UNAUTHORIZED');
  const user = await users.findById(claims.userId);
  if (!user || !user.isActive) throw new AppError('UNAUTHORIZED');
  return {
    userId: user.id,
    roleId: user.roleId,
    roleCode: user.roleCode,
    permissions: await getPermissions(user.roleId),
    ip,
    userAgent,
  };
}
