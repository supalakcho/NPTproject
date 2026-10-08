import { closePool, rollbackTest, unique } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { permissions, rolePermissions } from '../../src/models/index.js';

after(closePool);

test('findAll เรียงตาม module, code และกรอง module ได้', rollbackTest(async (conn) => {
  const all = await permissions.findAll({}, { conn });
  assert.equal(all.length, 25);
  const keys = all.map((p) => `${p.module}|${p.code}`);
  assert.deepEqual(keys, [...keys].sort());
  const mod = all[0].module;
  const filtered = await permissions.findAll({ module: mod }, { conn });
  assert.ok(filtered.length > 0 && filtered.every((p) => p.module === mod));
}));

test('insert / findByCode / update / hardDelete ลบการผูกใน role_permissions (CASCADE)', rollbackTest(async (conn) => {
  const code = unique('test.');
  const perm = await permissions.insert({ code, name: 'ทดสอบ', module: 'test' }, { conn });
  assert.deepEqual(await permissions.findByCode(code, { conn }), perm);
  assert.equal((await permissions.update(perm.id, { name: 'แก้แล้ว' }, { conn })).name, 'แก้แล้ว');
  await rolePermissions.add(2, perm.id, { conn });
  assert.equal(await permissions.hardDelete(perm.id, { conn }), true);
  assert.equal(await rolePermissions.hasPermission(2, code, { conn }), false);
}));

test('ไม่พบคืน null / false และ code ซ้ำ → DUPLICATE', rollbackTest(async (conn) => {
  assert.equal(await permissions.findById(9999, { conn }), null);
  assert.equal(await permissions.update(9999, { name: 'x' }, { conn }), null);
  assert.equal(await permissions.hardDelete(9999, { conn }), false);
  const [first] = await permissions.findAll({}, { conn });
  await assert.rejects(permissions.insert({ code: first.code, name: 'x', module: 'x' }, { conn }), { code: 'DUPLICATE' });
}));
