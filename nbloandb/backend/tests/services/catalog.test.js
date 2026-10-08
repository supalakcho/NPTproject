import {
  closePool, unique, memberCtx, adminCtx, createNotebook, insertLoan, insertReservation, lastAudit, code, HOUR,
} from '../helpers/serviceEnv.js';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { brands, notebookModels, notebooks } from '../../src/services/index.js';

after(closePool);

let admin;
let member;
before(async () => {
  admin = await adminCtx();
  member = await memberCtx();
});

const modelInput = (brandId, over = {}) => ({
  brandId, modelName: unique('ThinkPad'), cpu: 'Intel Core i5', ramGb: 16, storageGb: 512, screenInch: 14.0, os: 'Windows 11 Pro', ...over,
});

test('brands: สร้าง แก้ ลบ กู้คืน พร้อม audit (กู้คืน = UPDATE + event restore)', async () => {
  const created = await brands.createBrand(admin.ctx, { name: `  ${unique('HP')} ` });
  assert.ok(!created.name.startsWith(' '));
  assert.equal((await lastAudit({ targetTable: 'brands', targetId: created.id })).action, 'CREATE');

  const renamed = await brands.updateBrand(admin.ctx, created.id, { name: unique('HPX') });
  const upd = await lastAudit({ targetTable: 'brands', targetId: created.id });
  assert.deepEqual(upd.newValues, { name: renamed.name });

  assert.equal(await brands.deleteBrand(admin.ctx, created.id), null);
  assert.ok(!(await brands.listBrandOptions(member.ctx)).some((b) => b.id === created.id));
  const restored = await brands.restoreBrand(admin.ctx, created.id);
  assert.equal(restored.deletedAt, null);
  assert.deepEqual((await lastAudit({ targetTable: 'brands', targetId: created.id })).newValues, { event: 'restore' });
  await assert.rejects(brands.restoreBrand(admin.ctx, created.id), code('BRAND_NOT_FOUND'));
});

test('brands: ชื่อซ้ำ (รวมที่ถูกลบ), ไม่พบ, ลบยี่ห้อที่มีรุ่นอยู่ได้ BRAND_IN_USE, สมาชิกจัดการไม่ได้', async () => {
  const a = await brands.createBrand(admin.ctx, { name: unique('Acer') });
  const b = await brands.createBrand(admin.ctx, { name: unique('Asus') });
  await assert.rejects(brands.createBrand(admin.ctx, { name: a.name }), code('BRAND_NAME_TAKEN'));
  await assert.rejects(brands.updateBrand(admin.ctx, b.id, { name: a.name }), code('BRAND_NAME_TAKEN'));
  await brands.updateBrand(admin.ctx, a.id, { name: a.name }); // ชื่อเดิมของตัวเองไม่ถือว่าซ้ำ
  await assert.rejects(brands.updateBrand(admin.ctx, 999999, { name: unique('X') }), code('BRAND_NOT_FOUND'));

  await notebookModels.createModel(admin.ctx, modelInput(a.id));
  await assert.rejects(brands.deleteBrand(admin.ctx, a.id), (e) => e.code === 'BRAND_IN_USE' && e.details.activeModels === 1);

  await assert.rejects(brands.createBrand(member.ctx, { name: unique('M') }), code('FORBIDDEN'));
  await assert.rejects(brands.listBrands(member.ctx), code('FORBIDDEN'));
  assert.ok((await brands.listBrandOptions(member.ctx)).some((x) => x.id === a.id));
});

test('brands.listBrands: แบ่งหน้า, ค้นหา, sort นอก whitelist ถูกปฏิเสธ, includeDeleted', async () => {
  const prefix = unique('Lst');
  const x = await brands.createBrand(admin.ctx, { name: `${prefix}-1` });
  await brands.createBrand(admin.ctx, { name: `${prefix}-2` });
  await brands.deleteBrand(admin.ctx, x.id);
  const page = await brands.listBrands(admin.ctx, { keyword: prefix, sort: 'name:asc', page: '1', pageSize: '10' });
  assert.equal(page.total, 1);
  assert.equal((await brands.listBrands(admin.ctx, { keyword: prefix, includeDeleted: 'true' })).total, 2);
  await assert.rejects(brands.listBrands(admin.ctx, { sort: 'deleted_at:asc' }), code('VALIDATION_ERROR'));
  await assert.rejects(brands.listBrands(admin.ctx, { pageSize: 101 }), code('VALIDATION_ERROR'));
});

test('notebookModels: สร้าง/ดู/แก้/ลบ/กู้คืน และกฎสเปก', async () => {
  const brand = await brands.createBrand(admin.ctx, { name: unique('Dell') });
  const model = await notebookModels.createModel(admin.ctx, modelInput(brand.id));
  assert.equal(model.brandName, brand.name);
  assert.equal((await notebookModels.getById(member.ctx, model.id)).modelName, model.modelName);

  await assert.rejects(notebookModels.createModel(admin.ctx, modelInput(brand.id, { modelName: model.modelName })), code('MODEL_NAME_TAKEN'));
  await assert.rejects(notebookModels.createModel(admin.ctx, modelInput(999999)), code('BRAND_NOT_FOUND'));
  await assert.rejects(
    notebookModels.createModel(admin.ctx, modelInput(brand.id, { ramGb: 512, storageGb: 16, screenInch: 9 })),
    (e) => e.code === 'VALIDATION_ERROR' && e.details.length === 3,
  );

  const updated = await notebookModels.updateModel(admin.ctx, model.id, { ramGb: 32 });
  assert.equal(updated.ramGb, 32);
  assert.deepEqual((await lastAudit({ targetTable: 'notebook_models', targetId: model.id })).newValues, { ramGb: 32 });
  await assert.rejects(notebookModels.updateModel(admin.ctx, model.id, { cpu: null }), code('VALIDATION_ERROR'));

  await notebookModels.deleteModel(admin.ctx, model.id);
  await assert.rejects(notebookModels.getById(member.ctx, model.id), code('MODEL_NOT_FOUND'));
  await brands.deleteBrand(admin.ctx, brand.id);
  await assert.rejects(notebookModels.restoreModel(admin.ctx, model.id), code('BRAND_NOT_FOUND')); // ยี่ห้อถูกลบอยู่
  await brands.restoreBrand(admin.ctx, brand.id);
  assert.equal((await notebookModels.restoreModel(admin.ctx, model.id)).deletedAt, null);
  await assert.rejects(notebookModels.createModel(member.ctx, modelInput(brand.id)), code('FORBIDDEN'));
});

test('notebookModels.deleteModel: ยังมีเครื่องใช้รุ่นนี้ → MODEL_IN_USE', async () => {
  const nb = await createNotebook();
  await assert.rejects(notebookModels.deleteModel(admin.ctx, nb.modelId), (e) => e.code === 'MODEL_IN_USE' && e.details.activeNotebooks === 1);
});

test('notebooks: สมาชิกไม่เห็น serial/สภาพ แอดมินเห็นครบ + activeLoan/upcomingReservations', async () => {
  const nb = await createNotebook();
  const forMember = await notebooks.getById(member.ctx, nb.id);
  assert.equal(forMember.serialNumber, undefined);
  assert.equal(forMember.conditionStatus, undefined);
  assert.equal(forMember.currentStatus, 'available');
  const listed = await notebooks.list(member.ctx, { keyword: nb.assetCode, includeDeleted: true });
  assert.equal(listed.rows[0].serialNumber, undefined);

  const forAdmin = await notebooks.getById(admin.ctx, nb.id);
  assert.equal(forAdmin.serialNumber, nb.serialNumber);
  assert.equal(forAdmin.activeLoan, null);
  assert.deepEqual(forAdmin.upcomingReservations, []);

  await insertReservation(member.user, nb, 30 * HOUR, 32 * HOUR);
  await insertLoan(member.user, nb, -HOUR, HOUR);
  const busy = await notebooks.getByAssetCode(admin.ctx, ` ${nb.assetCode.toLowerCase()} `);
  assert.equal(busy.activeLoan.notebookId, nb.id);
  assert.equal(busy.upcomingReservations.length, 1);
  assert.ok(busy.upcomingReservations[0].pickupDeadline instanceof Date);
  await assert.rejects(notebooks.getByAssetCode(member.ctx, 'NOPE-0000'), code('NOTEBOOK_NOT_FOUND'));
});

test('notebooks.create/update: ข้อมูลซ้ำ, รุ่นไม่มี, วันที่ซื้ออนาคต, audit', async () => {
  const existing = await createNotebook();
  const input = { modelId: existing.modelId, assetCode: unique('nb-').toLowerCase(), serialNumber: unique('SN'), purchasedAt: '2025-06-15' };
  const nb = await notebooks.create(admin.ctx, input);
  assert.equal(nb.assetCode, input.assetCode.toUpperCase());
  assert.equal(nb.conditionStatus, 'normal');
  assert.equal((await lastAudit({ targetTable: 'notebooks', targetId: nb.id })).action, 'CREATE');

  await assert.rejects(notebooks.create(admin.ctx, { ...input, serialNumber: unique('SN') }), code('ASSET_CODE_TAKEN'));
  await assert.rejects(notebooks.create(admin.ctx, { ...input, assetCode: unique('B'), serialNumber: existing.serialNumber }), code('SERIAL_NUMBER_TAKEN'));
  await assert.rejects(notebooks.create(admin.ctx, { ...input, assetCode: unique('C'), serialNumber: unique('S'), modelId: 999999 }), code('MODEL_NOT_FOUND'));
  await assert.rejects(notebooks.create(admin.ctx, { ...input, assetCode: unique('D'), serialNumber: unique('S'), purchasedAt: '2999-01-01' }), code('VALIDATION_ERROR'));
  await assert.rejects(notebooks.update(admin.ctx, nb.id, { assetCode: existing.assetCode }), code('ASSET_CODE_TAKEN'));
  await assert.rejects(notebooks.update(admin.ctx, 999999, { conditionNote: 'x' }), code('NOTEBOOK_NOT_FOUND'));
  await assert.rejects(notebooks.create(member.ctx, input), code('FORBIDDEN'));

  const { notebook, warnings } = await notebooks.update(admin.ctx, nb.id, { conditionNote: 'รอยขีดข่วน' });
  assert.equal(notebook.conditionNote, 'รอยขีดข่วน');
  assert.deepEqual(warnings.affectedReservations, []);
});

test('notebooks.update สภาพเครื่อง: retired ขณะมีการจอง = NOTEBOOK_HAS_COMMITMENTS · maintenance คืน warnings', async () => {
  const nb = await createNotebook();
  const r = await insertReservation(member.user, nb, 30 * HOUR, 32 * HOUR);
  await assert.rejects(
    notebooks.update(admin.ctx, nb.id, { conditionStatus: 'retired' }),
    (e) => e.code === 'NOTEBOOK_HAS_COMMITMENTS' && e.details.upcomingReservations === 1,
  );
  const { notebook, warnings } = await notebooks.update(admin.ctx, nb.id, { conditionStatus: 'maintenance' });
  assert.equal(notebook.conditionStatus, 'maintenance');
  assert.equal(notebook.currentStatus, 'maintenance');
  assert.deepEqual(warnings.affectedReservations.map((x) => x.id), [r.id]);

  const free = await createNotebook();
  assert.equal((await notebooks.update(admin.ctx, free.id, { conditionStatus: 'retired' })).notebook.conditionStatus, 'retired');
});

test('notebooks.delete: มีการยืมหรือการจองค้างลบไม่ได้ · ลบแล้วกู้คืนได้', async () => {
  const withLoan = await createNotebook();
  await insertLoan(member.user, withLoan, -HOUR, HOUR);
  await assert.rejects(notebooks.delete(admin.ctx, withLoan.id), (e) => e.code === 'NOTEBOOK_HAS_COMMITMENTS' && e.details.activeLoans === 1);

  const withRes = await createNotebook();
  await insertReservation(member.user, withRes, 30 * HOUR, 31 * HOUR);
  await assert.rejects(notebooks.delete(admin.ctx, withRes.id), code('NOTEBOOK_HAS_COMMITMENTS'));

  const free = await createNotebook();
  assert.equal(await notebooks.delete(admin.ctx, free.id), null);
  await assert.rejects(notebooks.getById(member.ctx, free.id), code('NOTEBOOK_NOT_FOUND'));
  await assert.rejects(notebooks.delete(admin.ctx, free.id), code('NOTEBOOK_NOT_FOUND'));
  assert.equal((await notebooks.restore(admin.ctx, free.id)).id, free.id);
  await assert.rejects(notebooks.delete(member.ctx, free.id), code('FORBIDDEN'));
});

test('notebooks.searchAvailable: ตรวจช่วงเวลาแบบการจอง และไม่รวมเครื่องที่ถูกยืม/จองทับ', async () => {
  const start = new Date(Date.now() + 26 * HOUR);
  start.setMilliseconds(0);
  const end = new Date(start.getTime() + 2 * HOUR);
  const free = await createNotebook();
  const reserved = await createNotebook({ modelId: free.modelId });
  await insertReservation(member.user, reserved, 25 * HOUR, 27 * HOUR);
  const rows = await notebooks.searchAvailable(member.ctx, { startAt: start.toISOString(), endAt: end.toISOString(), modelId: String(free.modelId) });
  assert.deepEqual(rows.map((r) => r.id), [free.id]);

  const past = new Date(Date.now() - HOUR).toISOString();
  await assert.rejects(notebooks.searchAvailable(member.ctx, { startAt: past, endAt: end.toISOString() }), code('INVALID_TIME_RANGE'));
  const far = new Date(Date.now() + 8 * 24 * HOUR);
  await assert.rejects(
    notebooks.searchAvailable(member.ctx, { startAt: far.toISOString(), endAt: new Date(far.getTime() + HOUR).toISOString() }),
    (e) => e.code === 'RESERVATION_TOO_FAR_AHEAD' && e.message.includes('7'),
  );
});
