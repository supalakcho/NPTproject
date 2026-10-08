import { closePool, rollbackTest, fromNow, HOUR, MINUTE } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { reports, loans, reservations, notebooks } from '../../src/models/index.js';
import { createNotebook, createUser } from '../helpers/fixtures.js';

after(closePool);

test('statusSummary นับตามสถานะปัจจุบัน และเปลี่ยนตามการยืม/จอง/สภาพเครื่อง', rollbackTest(async (conn) => {
  const before = await reports.statusSummary({ conn });
  assert.deepEqual(Object.keys(before), ['total', 'available', 'borrowed', 'reserved', 'damaged', 'maintenance', 'retired']);
  assert.ok(Object.values(before).every((v) => typeof v === 'number'));

  const user = await createUser(conn);
  const borrowed = await createNotebook(conn);
  const reserved = await createNotebook(conn);
  await createNotebook(conn, { conditionStatus: 'retired' });
  await createNotebook(conn);
  const deleted = await createNotebook(conn);
  await notebooks.softDelete(deleted.id, { conn });
  await loans.insert({ userId: user.id, notebookId: borrowed.id, borrowedAt: fromNow(-HOUR), dueAt: fromNow(HOUR) }, { conn });
  await reservations.insert({ userId: user.id, notebookId: reserved.id, startAt: fromNow(-10 * MINUTE), endAt: fromNow(HOUR) }, { conn });

  const after = await reports.statusSummary({ conn });
  assert.deepEqual(after, {
    total: before.total + 4,
    available: before.available + 1,
    borrowed: before.borrowed + 1,
    reserved: before.reserved + 1,
    damaged: before.damaged,
    maintenance: before.maintenance,
    retired: before.retired + 1,
  });
}));

test('outstandingLoans: เฉพาะที่ยังไม่คืน เกินกำหนดก่อน และกรอง status ได้', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const borrow = async (b, d) =>
    loans.insert({ userId: user.id, notebookId: (await createNotebook(conn)).id, borrowedAt: fromNow(b), dueAt: fromNow(d) }, { conn });
  const borrowing = await borrow(-HOUR, HOUR);
  const overdue = await borrow(-3 * HOUR, -HOUR);
  const pending = await borrow(-HOUR, 30 * MINUTE);
  await loans.requestReturn(pending.id, {}, { conn });
  const returned = await borrow(-2 * HOUR, HOUR);
  await loans.confirmReturn(returned.id, { receivedBy: 1, returnCondition: 'normal' }, { conn });
  const cancelled = await borrow(-2 * HOUR, HOUR);
  await loans.cancel(cancelled.id, { cancelledBy: 1 }, { conn });

  const result = await reports.outstandingLoans({}, { conn });
  const mine = result.rows.filter((l) => l.userId === user.id);
  assert.deepEqual(mine.map((l) => l.id), [overdue.id, pending.id, borrowing.id]);
  assert.deepEqual((await reports.outstandingLoans({ status: 'return_pending' }, { conn })).rows.map((l) => l.id), [pending.id]);
  assert.equal((await reports.outstandingLoans({ status: 'returned' }, { conn })).total, 0);
}));

test('availableNotebooks: เฉพาะเครื่องที่ว่างตอนนี้ กรองยี่ห้อได้', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const free = await createNotebook(conn);
  const busy = await createNotebook(conn);
  await loans.insert({ userId: user.id, notebookId: busy.id, borrowedAt: fromNow(-HOUR), dueAt: fromNow(HOUR) }, { conn });
  const result = await reports.availableNotebooks({}, { conn });
  assert.ok(result.rows.every((n) => n.currentStatus === 'available'));
  assert.ok(result.rows.some((n) => n.id === free.id));
  assert.ok(!result.rows.some((n) => n.id === busy.id));
  assert.deepEqual((await reports.availableNotebooks({ brandId: free.brandId }, { conn })).rows.map((n) => n.id), [free.id]);
}));

test('monthlyLoans: นับต่อเดือน ไม่นับที่ยกเลิก พร้อมจำนวนคืนช้า กรองช่วงเดือนได้', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0);
  const add = async (borrowedAt, dueAt, requestAt) => {
    const loan = await loans.insert({ userId: user.id, notebookId: (await createNotebook(conn)).id, borrowedAt, dueAt }, { conn });
    await loans.confirmReturn(loan.id, { receivedBy: 1, returnCondition: 'normal', at: requestAt }, { conn });
    return loan;
  };
  await add(at(2020, 1, 5, 9), at(2020, 1, 5, 17), at(2020, 1, 5, 16)); // ตรงเวลา
  await add(at(2020, 1, 20, 9), at(2020, 1, 20, 17), at(2020, 1, 21, 9)); // คืนช้า
  const cancelled = await loans.insert({ userId: user.id, notebookId: (await createNotebook(conn)).id, borrowedAt: at(2020, 1, 25, 9), dueAt: at(2020, 1, 25, 12) }, { conn });
  await loans.cancel(cancelled.id, { cancelledBy: 1 }, { conn });
  await add(at(2020, 3, 1, 9), at(2020, 3, 1, 12), at(2020, 3, 1, 11));

  assert.deepEqual(await reports.monthlyLoans({ fromMonth: '2020-01', toMonth: '2020-03' }, { conn }), [
    { loanMonth: '2020-01', totalLoans: 2, lateLoans: 1 },
    { loanMonth: '2020-03', totalLoans: 1, lateLoans: 0 },
  ]);
  assert.deepEqual(await reports.monthlyLoans({ fromMonth: '2020-02', toMonth: '2020-02' }, { conn }), []);
  assert.deepEqual((await reports.monthlyLoans({ fromMonth: '2020-03', toMonth: '2020-03' }, { conn })).map((r) => r.loanMonth), ['2020-03']);
}));
