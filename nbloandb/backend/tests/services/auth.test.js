import { closePool, unique, memberCtx, lastAudit, code } from '../helpers/serviceEnv.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { users } from '../../src/models/index.js';
import { auth, profile, anonymousCtx } from '../../src/services/index.js';

after(closePool);

const anon = anonymousCtx({ ip: '10.0.0.1', userAgent: 'node-test' });
const registerInput = (over = {}) => ({
  email: `${unique('reg')}@Test.Local`,
  password: 'Passw0rd',
  firstName: ' สมชาย ',
  lastName: 'ใจดี',
  phone: '0812345678',
  ...over,
});
const hasSecret = (obj) => JSON.stringify(obj).toLowerCase().includes('password');

test('register: ใช้งานได้ทันที ได้ token + permissions ของสมาชิก, อีเมลเป็นตัวเล็ก, trim ชื่อ, audit REGISTER', async () => {
  const input = registerInput({ memberCode: unique('M') });
  const result = await auth.register(anon, input);
  assert.ok(result.token);
  assert.ok(result.expiresAt instanceof Date);
  assert.equal(result.user.email, input.email.toLowerCase());
  assert.equal(result.user.firstName, 'สมชาย');
  assert.equal(result.user.roleCode, 'member');
  assert.ok(result.permissions.includes('loan.create'));
  assert.ok(!result.permissions.includes('setting.manage'));
  assert.ok(!hasSecret(result.user));
  const log = await lastAudit({ userId: result.user.id, action: 'REGISTER' });
  assert.equal(log.ipAddress, '10.0.0.1');
  assert.ok(!hasSecret(log));
});

test('register: อีเมล/รหัสสมาชิกซ้ำ และ input ผิดรูปแบบ', async () => {
  const first = await auth.register(anon, registerInput({ memberCode: unique('M') }));
  await assert.rejects(auth.register(anon, registerInput({ email: first.user.email.toUpperCase() })), code('EMAIL_TAKEN'));
  await assert.rejects(auth.register(anon, registerInput({ memberCode: first.user.memberCode })), code('MEMBER_CODE_TAKEN'));
  await assert.rejects(
    auth.register(anon, registerInput({ email: 'not-email', password: 'short', phone: '12345' })),
    (err) => err.code === 'VALIDATION_ERROR' && ['email', 'password', 'phone'].every((f) => err.details.some((d) => d.field === f)),
  );
});

test('login: สำเร็จได้ token, อัปเดต lastLoginAt, audit LOGIN_SUCCESS, ไม่มี passwordHash', async () => {
  const { user } = await auth.register(anon, registerInput());
  const result = await auth.login(anon, { email: user.email.toUpperCase(), password: 'Passw0rd' });
  assert.equal(result.user.id, user.id);
  assert.ok(result.user.lastLoginAt instanceof Date);
  assert.ok(!hasSecret(result.user));
  assert.ok(await lastAudit({ userId: user.id, action: 'LOGIN_SUCCESS' }));
});

test('login: รหัสผิดกับอีเมลผิดได้ error และข้อความเดียวกัน + audit LOGIN_FAILED', async () => {
  const { user } = await auth.register(anon, registerInput());
  const wrongPass = await auth.login(anon, { email: user.email, password: 'Wrong1234' }).catch((e) => e);
  const wrongEmail = await auth.login(anon, { email: `${unique('none')}@x.local`, password: 'Passw0rd' }).catch((e) => e);
  assert.equal(wrongPass.code, 'INVALID_CREDENTIALS');
  assert.equal(wrongEmail.code, 'INVALID_CREDENTIALS');
  assert.equal(wrongPass.message, wrongEmail.message);
  const log = await lastAudit({ userId: user.id, action: 'LOGIN_FAILED' });
  assert.equal(log.newValues.email, user.email);
});

test('login: บัญชีที่ seed ไว้ใน SQL ใช้ได้ (admin@example.com / Admin@1234)', async () => {
  const result = await auth.login(anon, { email: 'admin@example.com', password: 'Admin@1234' });
  assert.equal(result.user.roleCode, 'admin');
  assert.ok(result.permissions.includes('setting.manage'));
});

test('บัญชีถูกระงับ: login ได้ ACCOUNT_SUSPENDED และ token เดิมใช้ไม่ได้ทันที', async () => {
  const { token, user } = await auth.register(anon, registerInput());
  const ctx = await auth.authenticate(token, { ip: '10.0.0.2' });
  assert.equal(ctx.userId, user.id);
  assert.ok(ctx.permissions.has('loan.create'));

  await users.update(user.id, { isActive: false });
  await assert.rejects(auth.login(anon, { email: user.email, password: 'Passw0rd' }), code('ACCOUNT_SUSPENDED'));
  assert.equal((await lastAudit({ userId: user.id, action: 'LOGIN_FAILED' })).newValues.reason, 'suspended');
  await assert.rejects(auth.authenticate(token, {}), code('UNAUTHORIZED'));
});

test('authenticate: ไม่มี token / token ปลอม / บัญชีถูกลบ → UNAUTHORIZED', async () => {
  await assert.rejects(auth.authenticate(undefined, {}), code('UNAUTHORIZED'));
  await assert.rejects(auth.authenticate('abc.def.ghi', {}), code('UNAUTHORIZED'));
  const { token, user } = await auth.register(anon, registerInput());
  await users.softDelete(user.id);
  await assert.rejects(auth.authenticate(token, {}), code('UNAUTHORIZED'));
});

test('logout: เขียน audit LOGOUT · ไม่ login = UNAUTHORIZED', async () => {
  const { user, ctx } = await memberCtx();
  assert.equal(await auth.logout(ctx), null);
  assert.ok(await lastAudit({ userId: user.id, action: 'LOGOUT' }));
  await assert.rejects(auth.logout(anon), code('UNAUTHORIZED'));
});

test('profile.getMe: ข้อมูลตัวเอง + permissions ไม่มี passwordHash', async () => {
  const { user, ctx } = await memberCtx();
  const me = await profile.getMe(ctx);
  assert.equal(me.id, user.id);
  assert.ok(me.permissions.includes('notebook.view'));
  assert.ok(!hasSecret(me));
  await assert.rejects(profile.getMe(anon), code('UNAUTHORIZED'));
});

test('profile.updateMe: แก้ได้เฉพาะชื่อ/เบอร์ (อีเมลถูกเพิกเฉย) + audit เฉพาะ field ที่เปลี่ยน', async () => {
  const { user, ctx } = await memberCtx();
  const updated = await profile.updateMe(ctx, { lastName: 'ใจดีมาก', phone: '0899999999', email: 'hack@x.local' });
  assert.equal(updated.lastName, 'ใจดีมาก');
  assert.equal(updated.email, user.email);
  const log = await lastAudit({ targetTable: 'users', targetId: user.id, action: 'UPDATE' });
  assert.deepEqual(log.oldValues, { lastName: 'ระบบ', phone: '0800000000' });
  assert.deepEqual(log.newValues, { lastName: 'ใจดีมาก', phone: '0899999999' });
  await assert.rejects(profile.updateMe(ctx, { firstName: '' }), code('VALIDATION_ERROR'));
  await assert.rejects(profile.updateMe(ctx, { phone: '999' }), code('VALIDATION_ERROR'));
});

test('profile.changePassword: รหัสเดิมผิด, รหัสใหม่ซ้ำเดิม/ไม่ตามนโยบาย, สำเร็จแล้ว login ด้วยรหัสใหม่ได้', async () => {
  const { user } = await auth.register(anon, registerInput());
  const ctx = await auth.authenticate((await auth.login(anon, { email: user.email, password: 'Passw0rd' })).token, {});
  await assert.rejects(profile.changePassword(ctx, { currentPassword: 'Wrong1234', newPassword: 'NewPassw0rd' }), code('CURRENT_PASSWORD_INCORRECT'));
  await assert.rejects(profile.changePassword(ctx, { currentPassword: 'Passw0rd', newPassword: 'Passw0rd' }), code('VALIDATION_ERROR'));
  await assert.rejects(profile.changePassword(ctx, { currentPassword: 'Passw0rd', newPassword: 'abcdefgh' }), code('VALIDATION_ERROR'));
  assert.equal(await profile.changePassword(ctx, { currentPassword: 'Passw0rd', newPassword: 'NewPassw0rd' }), null);
  await assert.rejects(auth.login(anon, { email: user.email, password: 'Passw0rd' }), code('INVALID_CREDENTIALS'));
  assert.ok((await auth.login(anon, { email: user.email, password: 'NewPassw0rd' })).token);
  const log = await lastAudit({ targetTable: 'users', targetId: user.id, action: 'UPDATE' });
  assert.deepEqual(log.newValues, { event: 'change_password' });
});
