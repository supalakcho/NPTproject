import { closePool, rollbackTest, unique } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { brands, notebookModels, notebooks } from '../../src/models/index.js';

after(closePool);

const SPEC = { cpu: 'Core i7-1355U', ramGb: 16, storageGb: 512, screenInch: 15.6, os: 'Windows 11' };

async function newBrand(conn) {
  return brands.insert({ name: unique('B') }, { conn });
}

test('insert แล้ว findById ได้ชื่อยี่ห้อ และ screenInch เป็น Number', rollbackTest(async (conn) => {
  const brand = await newBrand(conn);
  const model = await notebookModels.insert({ brandId: brand.id, modelName: 'X1', ...SPEC }, { conn });
  assert.equal(model.brandName, brand.name);
  assert.equal(model.screenInch, 15.6);
  assert.equal(typeof model.ramGb, 'number');
  assert.equal(model.imagePath, null);
  assert.deepEqual(await notebookModels.findById(model.id, { conn }), model);
  assert.deepEqual(await notebookModels.findByBrandAndName(brand.id, 'X1', { conn }), model);
}));

test('update เฉพาะ field ที่ส่ง / ไม่พบคืน null / false', rollbackTest(async (conn) => {
  const brand = await newBrand(conn);
  const model = await notebookModels.insert({ brandId: brand.id, modelName: 'X1', ...SPEC }, { conn });
  const updated = await notebookModels.update(model.id, { ramGb: 32 }, { conn });
  assert.equal(updated.ramGb, 32);
  assert.equal(updated.cpu, SPEC.cpu);
  assert.equal(await notebookModels.findById(999999, { conn }), null);
  assert.equal(await notebookModels.update(999999, { ramGb: 8 }, { conn }), null);
  assert.equal(await notebookModels.softDelete(999999, { conn }), false);
}));

test('soft delete / restore / includeDeleted', rollbackTest(async (conn) => {
  const brand = await newBrand(conn);
  const model = await notebookModels.insert({ brandId: brand.id, modelName: 'X1', ...SPEC }, { conn });
  assert.equal(await notebookModels.softDelete(model.id, { conn }), true);
  assert.equal(await notebookModels.findById(model.id, { conn }), null);
  assert.equal((await notebookModels.list({ brandId: brand.id }, { conn })).total, 0);
  assert.equal((await notebookModels.list({ brandId: brand.id }, { conn, includeDeleted: true })).total, 1);
  assert.equal(await notebookModels.restore(model.id, { conn }), true);
  assert.ok(await notebookModels.findById(model.id, { conn }));
}));

test('list: keyword ค้นชื่อรุ่นและ CPU, sort ถูกทิศ', rollbackTest(async (conn) => {
  const brand = await newBrand(conn);
  const tag = unique('cpu');
  await notebookModels.insert({ brandId: brand.id, modelName: 'A', ...SPEC, ramGb: 8, cpu: tag }, { conn });
  await notebookModels.insert({ brandId: brand.id, modelName: `B-${tag}`, ...SPEC, ramGb: 64 }, { conn });
  const result = await notebookModels.list({ keyword: tag, sort: 'ramGb:desc' }, { conn });
  assert.equal(result.total, 2);
  assert.deepEqual(result.rows.map((m) => m.ramGb), [64, 8]);
  await assert.rejects(notebookModels.list({ sort: 'cpu:asc' }, { conn }), { code: 'INVALID_COLUMN' });
}));

test('error: สเปกนอกช่วง → CHECK_FAILED, รุ่นซ้ำในยี่ห้อ → DUPLICATE, brandId ไม่มีจริง → FK_NOT_FOUND', rollbackTest(async (conn) => {
  const brand = await newBrand(conn);
  await assert.rejects(notebookModels.insert({ brandId: brand.id, modelName: 'Big', ...SPEC, screenInch: 21 }, { conn }), {
    code: 'CHECK_FAILED',
    constraint: 'chk_models_screen',
  });
  await notebookModels.insert({ brandId: brand.id, modelName: 'Dup', ...SPEC }, { conn });
  await assert.rejects(notebookModels.insert({ brandId: brand.id, modelName: 'Dup', ...SPEC }, { conn }), {
    code: 'DUPLICATE',
    constraint: 'uq_models_brand_name',
  });
  await assert.rejects(notebookModels.insert({ brandId: 65000, modelName: 'X', ...SPEC }, { conn }), { code: 'FK_NOT_FOUND' });
}));

test('countActiveNotebooks นับเฉพาะเครื่องที่ไม่ถูกลบ และลบยี่ห้อที่มีรุ่นอยู่ไม่ได้ในระดับ service', rollbackTest(async (conn) => {
  const brand = await newBrand(conn);
  const model = await notebookModels.insert({ brandId: brand.id, modelName: 'X', ...SPEC }, { conn });
  const nb = await notebooks.insert({ modelId: model.id, assetCode: unique('A'), serialNumber: unique('S') }, { conn });
  await notebooks.insert({ modelId: model.id, assetCode: unique('A'), serialNumber: unique('S') }, { conn });
  assert.equal(await notebookModels.countActiveNotebooks(model.id, { conn }), 2);
  await notebooks.softDelete(nb.id, { conn });
  assert.equal(await notebookModels.countActiveNotebooks(model.id, { conn }), 1);
}));
