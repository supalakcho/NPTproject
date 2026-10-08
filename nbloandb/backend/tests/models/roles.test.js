import { closePool, rollbackTest, unique } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { roles } from '../../src/models/index.js';

after(closePool);

test('findById / findByCode / findAll อ่านข้อมูลตั้งต้น', rollbackTest(async (conn) => {
  const admin = await roles.findByCode('admin', { conn });
  assert.equal(admin.id, 1);
  assert.ok(admin.createdAt instanceof Date);
  assert.deepEqual(await roles.findById(admin.id, { conn }), admin);
  assert.deepEqual((await roles.findAll({ conn })).map((r) => r.code).slice(0, 2), ['admin', 'member']);
}));

test('ไม่พบคืน null / false', rollbackTest(async (conn) => {
  assert.equal(await roles.findById(250, { conn }), null);
  assert.equal(await roles.findByCode('nope', { conn }), null);
  assert.equal(await roles.update(250, { name: 'x' }, { conn }), null);
  assert.equal(await roles.hardDelete(250, { conn }), false);
}));

test('insert / update เฉพาะ field ที่ส่ง / hardDelete', rollbackTest(async (conn) => {
  const role = await roles.insert({ code: unique('r'), name: 'เจ้าหน้าที่' }, { conn });
  assert.equal(role.description, null);
  const updated = await roles.update(role.id, { description: 'ดูแลคลัง' }, { conn });
  assert.equal(updated.description, 'ดูแลคลัง');
  assert.equal(updated.name, 'เจ้าหน้าที่');
  assert.equal(await roles.hardDelete(role.id, { conn }), true);
  assert.equal(await roles.findById(role.id, { conn }), null);
}));

test('error: code ซ้ำ → DUPLICATE, ลบ role ที่มีผู้ใช้ → FK_IN_USE, field แปลก → INVALID_COLUMN', rollbackTest(async (conn) => {
  await assert.rejects(roles.insert({ code: 'member', name: 'x' }, { conn }), { code: 'DUPLICATE' });
  await assert.rejects(roles.hardDelete(2, { conn }), { code: 'FK_IN_USE' });
  await assert.rejects(roles.update(1, { id: 99 }, { conn }), { code: 'INVALID_COLUMN' });
}));
