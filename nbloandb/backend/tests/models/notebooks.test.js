import { pool, closePool, rollbackTest, unique, fromNow, HOUR } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { notebooks, loans, reservations } from '../../src/models/index.js';
import { createNotebook, createUser } from '../helpers/fixtures.js';

after(closePool);

const NOTEBOOK_FIELDS = [
  'id', 'assetCode', 'serialNumber', 'conditionStatus', 'conditionNote', 'purchasedAt', 'currentStatus', 'modelId',
  'modelName', 'brandId', 'brandName', 'cpu', 'ramGb', 'storageGb', 'screenInch', 'os', 'imagePath',
  'createdAt', 'updatedAt', 'deletedAt',
];

test('insert แล้ว findById / findByAssetCode / findBySerialNumber ได้สเปกและสถานะปัจจุบัน', rollbackTest(async (conn) => {
  const nb = await createNotebook(conn, { purchasedAt: new Date(2025, 5, 1) });
  assert.deepEqual(Object.keys(nb).sort(), [...NOTEBOOK_FIELDS].sort());
  assert.equal(nb.conditionStatus, 'normal', 'ค่าเริ่มต้น normal');
  assert.equal(nb.currentStatus, 'available');
  assert.equal(nb.screenInch, 14);
  assert.ok(nb.purchasedAt instanceof Date);
  assert.equal(nb.purchasedAt.getFullYear(), 2025);
  assert.deepEqual(await notebooks.findByAssetCode(nb.assetCode, { conn }), nb);
  assert.deepEqual(await notebooks.findBySerialNumber(nb.serialNumber, { conn }), nb);
}));

test('ข้อมูลตั้งต้น: NB-0005 สถานะ maintenance มาจาก View', rollbackTest(async (conn) => {
  assert.equal((await notebooks.findByAssetCode('NB-0005', { conn })).currentStatus, 'maintenance');
}));

test('update / updateCondition / ไม่พบคืน null / false', rollbackTest(async (conn) => {
  const nb = await createNotebook(conn);
  const serial = unique('S2');
  assert.equal((await notebooks.update(nb.id, { serialNumber: serial }, { conn })).serialNumber, serial);
  const damaged = await notebooks.updateCondition(nb.id, 'damaged', 'จอแตก', { conn });
  assert.equal(damaged.conditionStatus, 'damaged');
  assert.equal(damaged.conditionNote, 'จอแตก');
  assert.equal(damaged.currentStatus, 'damaged');
  assert.equal(await notebooks.findById(999999, { conn }), null);
  assert.equal(await notebooks.update(999999, { conditionNote: 'x' }, { conn }), null);
  assert.equal(await notebooks.updateCondition(999999, 'normal', null, { conn }), null);
  assert.equal(await notebooks.restore(999999, { conn }), false);
}));

test('soft delete / restore / includeDeleted', rollbackTest(async (conn) => {
  const nb = await createNotebook(conn);
  assert.equal(await notebooks.softDelete(nb.id, { conn }), true);
  assert.equal(await notebooks.findById(nb.id, { conn }), null);
  assert.equal((await notebooks.list({ keyword: nb.assetCode }, { conn })).total, 0);
  const deleted = await notebooks.findById(nb.id, { conn, includeDeleted: true });
  assert.ok(deleted.deletedAt instanceof Date);
  assert.equal(deleted.currentStatus, null);
  assert.equal(await notebooks.restore(nb.id, { conn }), true);
  assert.equal((await notebooks.findById(nb.id, { conn })).currentStatus, 'available');
}));

test('list: keyword, กรอง conditionStatus/currentStatus/modelId, sort', rollbackTest(async (conn) => {
  const all = await notebooks.list({ sort: 'assetCode:asc' }, { conn });
  assert.deepEqual(all.rows.map((n) => n.assetCode).slice(0, 5), ['NB-0001', 'NB-0002', 'NB-0003', 'NB-0004', 'NB-0005']);
  const desc = await notebooks.list({ sort: 'assetCode:desc', pageSize: 1 }, { conn });
  assert.equal(desc.rows.length, 1);
  assert.equal(desc.total, all.total);
  assert.equal((await notebooks.list({ keyword: 'Lenovo' }, { conn })).total, 2);
  assert.deepEqual((await notebooks.list({ conditionStatus: 'maintenance' }, { conn })).rows.map((n) => n.assetCode), ['NB-0005']);
  assert.equal((await notebooks.list({ currentStatus: 'available' }, { conn })).total, 4);
  assert.equal((await notebooks.list({ modelId: 1 }, { conn })).total, 2);
  await assert.rejects(notebooks.list({ sort: 'serialNumber:asc' }, { conn }), { code: 'INVALID_COLUMN' });
}));

test('currentStatus เป็น borrowed เมื่อมีการยืมค้าง', rollbackTest(async (conn) => {
  const nb = await createNotebook(conn);
  const user = await createUser(conn);
  await loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: fromNow(-HOUR), dueAt: fromNow(HOUR) }, { conn });
  assert.equal((await notebooks.findById(nb.id, { conn })).currentStatus, 'borrowed');
}));

test('findAvailableInRange ไม่รวมเครื่องที่ถูกยืม/จองทับช่วง เครื่องเสีย และเครื่องที่ถูกลบ', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const free = await createNotebook(conn);
  const borrowed = await createNotebook(conn);
  const reserved = await createNotebook(conn);
  const reservedOutside = await createNotebook(conn);
  const damaged = await createNotebook(conn, { conditionStatus: 'damaged' });
  const deleted = await createNotebook(conn);
  await notebooks.softDelete(deleted.id, { conn });

  const start = fromNow(2 * HOUR);
  const end = fromNow(4 * HOUR);
  await loans.insert({ userId: user.id, notebookId: borrowed.id, borrowedAt: fromNow(-HOUR), dueAt: fromNow(3 * HOUR) }, { conn });
  await reservations.insert({ userId: user.id, notebookId: reserved.id, startAt: fromNow(3 * HOUR), endAt: fromNow(5 * HOUR) }, { conn });
  // ชนขอบพอดี (end = start) ไม่นับว่าทับ
  await reservations.insert({ userId: user.id, notebookId: reservedOutside.id, startAt: end, endAt: fromNow(6 * HOUR) }, { conn });

  const ids = (await notebooks.findAvailableInRange(start, end, { conn })).map((n) => n.id);
  assert.ok(ids.includes(free.id));
  assert.ok(ids.includes(reservedOutside.id));
  for (const nb of [borrowed, reserved, damaged, deleted]) assert.ok(!ids.includes(nb.id), nb.assetCode);

  const byModel = await notebooks.findAvailableInRange(start, end, { modelId: free.modelId, conn });
  assert.deepEqual(byModel.map((n) => n.id), [free.id]);
}));

test('countOpenCommitments นับการยืมค้างและการจองที่ยังมีผล', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const nb = await createNotebook(conn);
  assert.deepEqual(await notebooks.countOpenCommitments(nb.id, { conn }), { activeLoans: 0, upcomingReservations: 0 });
  const loan = await loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: fromNow(-HOUR), dueAt: fromNow(HOUR) }, { conn });
  await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(2 * HOUR), endAt: fromNow(3 * HOUR) }, { conn });
  const cancelled = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(4 * HOUR), endAt: fromNow(5 * HOUR) }, { conn });
  await reservations.cancel(cancelled.id, { cancelledBy: user.id }, { conn });
  assert.deepEqual(await notebooks.countOpenCommitments(nb.id, { conn }), { activeLoans: 1, upcomingReservations: 1 });
  await loans.confirmReturn(loan.id, { receivedBy: 1, returnCondition: 'normal' }, { conn });
  assert.deepEqual(await notebooks.countOpenCommitments(nb.id, { conn }), { activeLoans: 0, upcomingReservations: 1 });
}));

test('error: asset_code ซ้ำ → DUPLICATE, modelId ไม่มีจริง → FK_NOT_FOUND, conditionStatus ผิด → error', rollbackTest(async (conn) => {
  const nb = await createNotebook(conn);
  await assert.rejects(notebooks.insert({ modelId: nb.modelId, assetCode: nb.assetCode, serialNumber: unique('S') }, { conn }), {
    code: 'DUPLICATE',
    constraint: 'uq_notebooks_asset_code',
  });
  await assert.rejects(notebooks.insert({ modelId: 999999, assetCode: unique('A'), serialNumber: unique('S') }, { conn }), { code: 'FK_NOT_FOUND' });
  await assert.rejects(notebooks.updateCondition(nb.id, 'exploded', null, { conn }), { name: 'DbError' });
}));

test('lockById ไม่ส่ง conn → throw ทันที', async () => {
  await assert.rejects(notebooks.lockById(1), /requires options.conn/);
});

test('lockById ล็อกแถวจริง: transaction ที่สองต้องรอจนตัวแรกจบ', async () => {
  const conn1 = await pool.getConnection();
  const conn2 = await pool.getConnection();
  try {
    await conn1.beginTransaction();
    await conn2.beginTransaction();
    const locked = await notebooks.lockById(1, { conn: conn1 });
    assert.deepEqual(locked, { id: 1, conditionStatus: 'normal', deletedAt: null });

    let secondDone = false;
    const second = notebooks.lockById(1, { conn: conn2 }).then((row) => {
      secondDone = true;
      return row;
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(secondDone, false, 'transaction ที่สองยังต้องรออยู่');

    await conn1.commit();
    const row = await second;
    assert.equal(row.id, 1);
  } finally {
    await conn1.rollback().catch(() => {});
    await conn2.rollback().catch(() => {});
    conn1.release();
    conn2.release();
  }
});
