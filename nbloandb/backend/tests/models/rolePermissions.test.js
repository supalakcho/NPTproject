import { closePool, rollbackTest, withRollback, unique } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rolePermissions, roles, permissions, query } from '../../src/models/index.js';

after(closePool);

async function newRole(conn) {
  return roles.insert({ code: unique('r'), name: 'ทดสอบ' }, { conn });
}

test('ข้อมูลตั้งต้น: admin มีสิทธิ์ และ findPermissionCodesByRoleId คืน string[]', rollbackTest(async (conn) => {
  const codes = await rolePermissions.findPermissionCodesByRoleId(1, { conn });
  assert.ok(codes.length > 0 && codes.every((c) => typeof c === 'string'));
  assert.equal(await rolePermissions.hasPermission(1, codes[0], { conn }), true);
  assert.equal(await rolePermissions.hasPermission(1, 'no.such.permission', { conn }), false);
  const perms = await rolePermissions.findPermissionsByRoleId(1, { conn });
  assert.deepEqual(perms.map((p) => p.code).sort(), [...codes].sort());
  assert.ok('module' in perms[0] && 'name' in perms[0]);
}));

test('add / remove: ผูกซ้ำคืน false ไม่ throw, ลบที่ไม่ได้ผูกคืน false', rollbackTest(async (conn) => {
  const role = await newRole(conn);
  const [perm] = await permissions.findAll({}, { conn });
  assert.equal(await rolePermissions.add(role.id, perm.id, { conn }), true);
  assert.equal(await rolePermissions.add(role.id, perm.id, { conn }), false);
  assert.equal(await rolePermissions.hasPermission(role.id, perm.code, { conn }), true);
  assert.equal(await rolePermissions.remove(role.id, perm.id, { conn }), true);
  assert.equal(await rolePermissions.remove(role.id, perm.id, { conn }), false);
}));

test('add ด้วย id ที่ไม่มีจริง → FK_NOT_FOUND', rollbackTest(async (conn) => {
  await assert.rejects(rolePermissions.add(250, 1, { conn }), { code: 'FK_NOT_FOUND' });
}));

test('replaceForRole แทนที่ทั้งหมดและตัดค่าซ้ำ', rollbackTest(async (conn) => {
  const role = await newRole(conn);
  const all = await permissions.findAll({}, { conn });
  await rolePermissions.replaceForRole(role.id, [all[0].id, all[1].id], { conn });
  const count = await rolePermissions.replaceForRole(role.id, [all[2].id, all[3].id, all[3].id], { conn });
  assert.equal(count, 2);
  assert.deepEqual(
    (await rolePermissions.findPermissionsByRoleId(role.id, { conn })).map((p) => p.id).sort((a, b) => a - b),
    [all[2].id, all[3].id].sort((a, b) => a - b),
  );
  assert.equal(await rolePermissions.replaceForRole(role.id, [], { conn }), 0);
}));

test('replaceForRole เป็น atomic: id ผิดตัวเดียวทำให้ของเดิมไม่ถูกลบ (ไม่ส่ง conn = เปิด transaction เอง)', async () => {
  // ใช้ role ตั้งต้น member เพราะ replaceForRole เปิด transaction แยก มองไม่เห็นข้อมูลที่ยังไม่ commit ของ test
  const before = await rolePermissions.findPermissionCodesByRoleId(2);
  const [perm] = await permissions.findAll();
  await assert.rejects(rolePermissions.replaceForRole(2, [perm.id, 65000]), { code: 'FK_NOT_FOUND' });
  assert.deepEqual(await rolePermissions.findPermissionCodesByRoleId(2), before);
});

test('ลบ role แล้วการผูกถูกลบตาม (CASCADE)', () =>
  withRollback(async (conn) => {
    const role = await newRole(conn);
    await rolePermissions.add(role.id, 1, { conn });
    await roles.hardDelete(role.id, { conn });
    const rows = await query('SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = ?', [role.id], { conn });
    assert.equal(rows[0].c, 0);
  }));
