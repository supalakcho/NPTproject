import { closePool, rollbackTest, unique } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { brands, notebookModels } from '../../src/models/index.js';

after(closePool);

test('insert แล้ว findById / findByName (ไม่สนตัวพิมพ์) ได้ค่าเดิม', rollbackTest(async (conn) => {
  const name = unique('Brand');
  const brand = await brands.insert({ name }, { conn });
  assert.equal(brand.name, name);
  assert.equal(brand.deletedAt, null);
  assert.deepEqual(await brands.findById(brand.id, { conn }), brand);
  assert.equal((await brands.findByName(name.toUpperCase(), { conn })).id, brand.id);
}));

test('update / ไม่พบคืน null / false', rollbackTest(async (conn) => {
  const brand = await brands.insert({ name: unique('B') }, { conn });
  const newName = unique('Renamed');
  assert.equal((await brands.update(brand.id, { name: newName }, { conn })).name, newName);
  assert.equal(await brands.findById(9999, { conn }), null);
  assert.equal(await brands.update(9999, { name: 'x' }, { conn }), null);
  assert.equal(await brands.softDelete(9999, { conn }), false);
  assert.equal(await brands.restore(9999, { conn }), false);
}));

test('soft delete: ไม่ออกใน find/list, includeDeleted เห็น, restore แล้วกลับมา', rollbackTest(async (conn) => {
  const name = unique('Gone');
  const brand = await brands.insert({ name }, { conn });
  assert.equal(await brands.softDelete(brand.id, { conn }), true);
  assert.equal(await brands.softDelete(brand.id, { conn }), false, 'ลบซ้ำคืน false');
  assert.equal(await brands.findById(brand.id, { conn }), null);
  assert.equal(await brands.findByName(name, { conn }), null);
  assert.equal(await brands.update(brand.id, { name: unique('x') }, { conn }), null, 'แก้ยี่ห้อที่ถูกลบไม่ได้');
  assert.ok(!(await brands.findAll({ conn })).some((b) => b.id === brand.id));
  assert.equal((await brands.list({ keyword: name }, { conn })).total, 0);

  const deleted = await brands.findById(brand.id, { conn, includeDeleted: true });
  assert.ok(deleted.deletedAt instanceof Date);
  assert.equal((await brands.list({ keyword: name }, { conn, includeDeleted: true })).total, 1);

  assert.equal(await brands.restore(brand.id, { conn }), true);
  assert.equal((await brands.findById(brand.id, { conn })).deletedAt, null);
}));

test('list: keyword, แบ่งหน้า, total, sort ถูกทิศ', rollbackTest(async (conn) => {
  const prefix = unique('Zlist');
  for (const suffix of ['c', 'a', 'b']) await brands.insert({ name: `${prefix}${suffix}` }, { conn });

  const asc = await brands.list({ keyword: prefix, sort: 'name:asc', pageSize: 2 }, { conn });
  assert.equal(asc.total, 3);
  assert.equal(asc.page, 1);
  assert.equal(asc.pageSize, 2);
  assert.deepEqual(asc.rows.map((b) => b.name), [`${prefix}a`, `${prefix}b`]);

  const page2 = await brands.list({ keyword: prefix, sort: 'name:asc', pageSize: 2, page: 2 }, { conn });
  assert.deepEqual(page2.rows.map((b) => b.name), [`${prefix}c`]);

  const desc = await brands.list({ keyword: prefix, sort: 'name:desc' }, { conn });
  assert.deepEqual(desc.rows.map((b) => b.name), [`${prefix}c`, `${prefix}b`, `${prefix}a`]);
}));

test('ความปลอดภัย: ค่าที่เป็น SQL ไม่เกิดผล, sort นอก whitelist ถูกปฏิเสธ, keyword % ไม่ใช่ wildcard', rollbackTest(async (conn) => {
  assert.equal(await brands.findByName("' OR 1=1 --", { conn }), null);
  assert.equal(await brands.findById('1 OR 1=1', { conn }).then((b) => b?.id), 1, 'ถูกตีความเป็นค่า 1 ไม่ใช่เงื่อนไข');
  assert.equal((await brands.list({ keyword: '%' }, { conn })).total, 0);
  const evil = await brands.insert({ name: "'; DROP TABLE users;--" }, { conn });
  assert.equal((await brands.findById(evil.id, { conn })).name, "'; DROP TABLE users;--");
  await assert.rejects(brands.list({ sort: 'deleted_at:asc' }, { conn }), { code: 'INVALID_COLUMN' });
}));

test('error: ชื่อซ้ำ (รวมที่ถูกลบ) → DUPLICATE, field แปลก → INVALID_COLUMN', rollbackTest(async (conn) => {
  const brand = await brands.insert({ name: unique('Dup') }, { conn });
  await brands.softDelete(brand.id, { conn });
  await assert.rejects(brands.insert({ name: brand.name }, { conn }), { code: 'DUPLICATE', constraint: 'uq_brands_name' });
  await assert.rejects(brands.insert({ name: 'x', deletedAt: null }, { conn }), { code: 'INVALID_COLUMN' });
}));

test('countActiveModels นับเฉพาะรุ่นที่ไม่ถูกลบ', rollbackTest(async (conn) => {
  const brand = await brands.insert({ name: unique('Cnt') }, { conn });
  const spec = { cpu: 'i5', ramGb: 8, storageGb: 256, screenInch: 14, os: 'Win' };
  const m1 = await notebookModels.insert({ brandId: brand.id, modelName: 'M1', ...spec }, { conn });
  await notebookModels.insert({ brandId: brand.id, modelName: 'M2', ...spec }, { conn });
  assert.equal(await brands.countActiveModels(brand.id, { conn }), 2);
  await notebookModels.softDelete(m1.id, { conn });
  assert.equal(await brands.countActiveModels(brand.id, { conn }), 1);
}));
