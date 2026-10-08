import { closePool, rollbackTest, unique } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { users } from '../../src/models/index.js';
import { createUser, FAKE_HASH } from '../helpers/fixtures.js';

after(closePool);

const USER_FIELDS = [
  'id', 'roleId', 'roleCode', 'roleName', 'memberCode', 'email', 'firstName', 'lastName', 'phone',
  'avatarPath', 'isActive', 'lastLoginAt', 'createdAt', 'updatedAt', 'deletedAt',
];

test('insert แล้ว findById ได้ field ตามที่ตกลง ไม่มี passwordHash และชนิดข้อมูลถูก', rollbackTest(async (conn) => {
  const user = await createUser(conn, { memberCode: unique('M').slice(0, 20) });
  assert.deepEqual(Object.keys(user).sort(), [...USER_FIELDS].sort());
  assert.equal(user.roleCode, 'member');
  assert.equal(user.isActive, true);
  assert.ok(user.createdAt instanceof Date);
  assert.deepEqual(await users.findById(user.id, { conn }), user);
  assert.deepEqual(await users.findByEmail(user.email, { conn }), user);
  assert.deepEqual(await users.findByMemberCode(user.memberCode, { conn }), user);
}));

test('findAuthByEmail คืน passwordHash สำหรับ login และไม่คืนบัญชีที่ถูกลบ', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  assert.deepEqual(await users.findAuthByEmail(user.email, { conn }), {
    id: user.id, roleId: user.roleId, roleCode: 'member', email: user.email, passwordHash: FAKE_HASH, isActive: true,
  });
  assert.equal(await users.findPasswordHashById(user.id, { conn }), FAKE_HASH);
  await users.softDelete(user.id, { conn });
  assert.equal(await users.findAuthByEmail(user.email, { conn }), null);
  assert.equal(await users.findPasswordHashById(user.id, { conn }), null);
}));

test('update เฉพาะ field ที่ส่ง และแก้ passwordHash ผ่าน update ไม่ได้', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const updated = await users.update(user.id, { phone: '0899999999', isActive: false }, { conn });
  assert.equal(updated.phone, '0899999999');
  assert.equal(updated.isActive, false);
  assert.equal(updated.firstName, user.firstName);
  await assert.rejects(users.update(user.id, { passwordHash: 'x' }, { conn }), { code: 'INVALID_COLUMN' });
}));

test('updatePassword / updateLastLogin', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const newHash = 'n'.repeat(60);
  assert.equal(await users.updatePassword(user.id, newHash, { conn }), true);
  assert.equal(await users.findPasswordHashById(user.id, { conn }), newHash);
  const at = new Date(2026, 0, 15, 9, 30, 0);
  assert.equal(await users.updateLastLogin(user.id, at, { conn }), true);
  assert.equal((await users.findById(user.id, { conn })).lastLoginAt.getTime(), at.getTime());
  assert.equal(await users.updateLastLogin(user.id, undefined, { conn }), true);
}));

test('ไม่พบคืน null / false', rollbackTest(async (conn) => {
  assert.equal(await users.findById(999999, { conn }), null);
  assert.equal(await users.findByEmail('none@x.y', { conn }), null);
  assert.equal(await users.findAuthByEmail('none@x.y', { conn }), null);
  assert.equal(await users.update(999999, { phone: '1' }, { conn }), null);
  assert.equal(await users.updatePassword(999999, 'x', { conn }), false);
  assert.equal(await users.softDelete(999999, { conn }), false);
  assert.equal(await users.restore(999999, { conn }), false);
}));

test('soft delete / restore และ includeDeleted', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  assert.equal(await users.softDelete(user.id, { conn }), true);
  assert.equal(await users.findById(user.id, { conn }), null);
  assert.equal(await users.update(user.id, { phone: '1' }, { conn }), null);
  assert.ok((await users.findById(user.id, { conn, includeDeleted: true })).deletedAt instanceof Date);
  assert.equal(await users.restore(user.id, { conn }), true);
  assert.equal((await users.findById(user.id, { conn })).deletedAt, null);
}));

test('isEmailTaken / isMemberCodeTaken นับบัญชีที่ถูกลบด้วย และ excludeId ได้', rollbackTest(async (conn) => {
  const code = unique('C').slice(0, 20);
  const user = await createUser(conn, { memberCode: code });
  await users.softDelete(user.id, { conn });
  assert.equal(await users.isEmailTaken(user.email, { conn }), true);
  assert.equal(await users.isEmailTaken(user.email, { excludeId: user.id, conn }), false);
  assert.equal(await users.isEmailTaken('free@x.y', { conn }), false);
  assert.equal(await users.isMemberCodeTaken(code, { conn }), true);
  assert.equal(await users.isMemberCodeTaken(code, { excludeId: user.id, conn }), false);
}));

test('list: keyword ค้นหลาย field, กรอง roleId/isActive, แบ่งหน้า, sort ถูกทิศ', rollbackTest(async (conn) => {
  const tag = unique('kw');
  const a = await createUser(conn, { firstName: `${tag}A`, email: `${unique('a')}@t.local` });
  const b = await createUser(conn, { lastName: `${tag}B`, email: `${unique('b')}@t.local` });
  const c = await createUser(conn, { phone: tag.slice(0, 15), email: `${unique('c')}@t.local`, roleCode: 'admin' });
  await users.update(b.id, { isActive: false }, { conn });

  const found = await users.list({ keyword: tag.slice(0, 15), sort: 'email:asc' }, { conn });
  assert.equal(found.total, 3);
  assert.deepEqual(found.rows.map((u) => u.email), [a, b, c].map((u) => u.email).sort());

  assert.deepEqual((await users.list({ keyword: tag.slice(0, 15), roleId: c.roleId }, { conn })).rows.map((u) => u.id), [c.id]);
  assert.deepEqual((await users.list({ keyword: tag.slice(0, 15), isActive: false }, { conn })).rows.map((u) => u.id), [b.id]);

  const page2 = await users.list({ keyword: tag.slice(0, 15), sort: 'email:desc', page: 2, pageSize: 2 }, { conn });
  assert.equal(page2.total, 3);
  assert.deepEqual(page2.rows.map((u) => u.email), [[a, b, c].map((u) => u.email).sort()[0]]);
}));

test('ความปลอดภัย: ไม่มี passwordHash ใน list, ค่า SQL injection ไม่เกิดผล, sort นอก whitelist ถูกปฏิเสธ', rollbackTest(async (conn) => {
  const { rows } = await users.list({}, { conn });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((u) => !('passwordHash' in u)));
  assert.equal(await users.findByEmail("x' OR '1'='1", { conn }), null);
  assert.equal((await users.list({ keyword: "'; DROP TABLE users;--" }, { conn })).total, 0);
  assert.ok((await users.list({}, { conn })).total > 0, 'ตาราง users ยังอยู่');
  await assert.rejects(users.list({ sort: 'passwordHash:asc' }, { conn }), { code: 'INVALID_COLUMN' });
}));

test('error: อีเมลซ้ำ → DUPLICATE (uq_users_email), roleId ไม่มีจริง → FK_NOT_FOUND', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  await assert.rejects(createUser(conn, { email: user.email }), { code: 'DUPLICATE', constraint: 'uq_users_email' });
  await assert.rejects(users.update(user.id, { roleId: 250 }, { conn }), { code: 'FK_NOT_FOUND' });
}));
