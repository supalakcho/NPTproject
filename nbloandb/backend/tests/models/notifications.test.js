import { closePool, rollbackTest, fromNow, HOUR } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { notifications, loans, reservations } from '../../src/models/index.js';
import { createNotebook, createUser } from '../helpers/fixtures.js';

after(closePool);

const NOTIFICATION_FIELDS = ['id', 'type', 'userId', 'loanId', 'reservationId', 'refDueAt', 'assetCode', 'isRead', 'readAt', 'createdAt'];

async function setup(conn) {
  const user = await createUser(conn);
  const nb = await createNotebook(conn);
  const loan = await loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: fromNow(-HOUR), dueAt: fromNow(HOUR) }, { conn });
  const res = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(2 * HOUR), endAt: fromNow(3 * HOUR) }, { conn });
  return { user, nb, loan, res };
}

test('insertIfNotExists สร้างแจ้งเตือน userId/assetCode มาจากการยืม และ findById ได้ค่าเดิม', rollbackTest(async (conn) => {
  const { user, nb, loan } = await setup(conn);
  const n = await notifications.insertIfNotExists({ type: 'loan_due_soon', loanId: loan.id, refDueAt: loan.dueAt }, { conn });
  assert.deepEqual(Object.keys(n).sort(), [...NOTIFICATION_FIELDS].sort());
  assert.equal(n.userId, user.id);
  assert.equal(n.assetCode, nb.assetCode);
  assert.equal(n.isRead, false);
  assert.equal(n.refDueAt.getTime(), loan.dueAt.getTime());
  assert.deepEqual(await notifications.findById(n.id, { conn }), n);
  assert.equal(await notifications.findById(999999, { conn }), null);
}));

test('insertIfNotExists ไม่สร้างซ้ำ (รวม type ที่ refDueAt เป็น NULL) แต่ refDueAt ใหม่สร้างได้', rollbackTest(async (conn) => {
  const { loan, res } = await setup(conn);
  const due = { type: 'loan_due_soon', loanId: loan.id, refDueAt: loan.dueAt };
  assert.ok(await notifications.insertIfNotExists(due, { conn }));
  assert.equal(await notifications.insertIfNotExists(due, { conn }), null);
  assert.ok(await notifications.insertIfNotExists({ ...due, refDueAt: fromNow(2 * HOUR) }, { conn }), 'หลังต่อเวลา');

  assert.ok(await notifications.insertIfNotExists({ type: 'loan_cancelled', loanId: loan.id }, { conn }));
  assert.equal(await notifications.insertIfNotExists({ type: 'loan_cancelled', loanId: loan.id }, { conn }), null);
  assert.ok(await notifications.insertIfNotExists({ type: 'reservation_starting', reservationId: res.id }, { conn }));
  assert.equal(await notifications.insertIfNotExists({ type: 'reservation_starting', reservationId: res.id }, { conn }), null);
}));

test('insertIfNotExists: type ไม่ตรงกับ target → CHECK_FAILED, loanId ไม่มีจริง → FK_NOT_FOUND', rollbackTest(async (conn) => {
  const { loan, res } = await setup(conn);
  await assert.rejects(notifications.insertIfNotExists({ type: 'reservation_starting', loanId: loan.id }, { conn }), { code: 'CHECK_FAILED' });
  await assert.rejects(notifications.insertIfNotExists({ type: 'loan_due_soon', loanId: loan.id }, { conn }), { code: 'CHECK_FAILED' }, 'ขาด refDueAt');
  await assert.rejects(notifications.insertIfNotExists({ type: 'loan_cancelled', loanId: loan.id, reservationId: res.id }, { conn }), { code: 'CHECK_FAILED' });
  await assert.rejects(notifications.insertIfNotExists({ type: 'loan_cancelled', loanId: 999999 }, { conn }), { code: 'FK_NOT_FOUND' });
}));

test('listByUser ใหม่สุดก่อน กรอง unreadOnly และไม่เห็นของคนอื่น / countUnreadByUser', rollbackTest(async (conn) => {
  const { user, loan, res } = await setup(conn);
  const other = await setup(conn);
  const n1 = await notifications.insertIfNotExists({ type: 'loan_due_soon', loanId: loan.id, refDueAt: loan.dueAt }, { conn });
  const n2 = await notifications.insertIfNotExists({ type: 'reservation_starting', reservationId: res.id }, { conn });
  await notifications.insertIfNotExists({ type: 'loan_cancelled', loanId: other.loan.id }, { conn });

  const list = await notifications.listByUser(user.id, {}, { conn });
  assert.equal(list.total, 2);
  assert.deepEqual(list.rows.map((n) => n.id), [n2.id, n1.id]);
  assert.equal(await notifications.countUnreadByUser(user.id, { conn }), 2);

  await notifications.markRead(n1.id, user.id, { conn });
  assert.deepEqual((await notifications.listByUser(user.id, { unreadOnly: true }, { conn })).rows.map((n) => n.id), [n2.id]);
  assert.equal(await notifications.countUnreadByUser(user.id, { conn }), 1);
}));

test('markRead อ่านได้เฉพาะของเจ้าของ และอ่านซ้ำไม่เปลี่ยน readAt / markAllRead คืนจำนวนที่เปลี่ยน', rollbackTest(async (conn) => {
  const { user, loan, res } = await setup(conn);
  const other = await createUser(conn);
  const n1 = await notifications.insertIfNotExists({ type: 'loan_due_soon', loanId: loan.id, refDueAt: loan.dueAt }, { conn });
  await notifications.insertIfNotExists({ type: 'reservation_starting', reservationId: res.id }, { conn });
  await notifications.insertIfNotExists({ type: 'loan_cancelled', loanId: loan.id }, { conn });

  assert.equal(await notifications.markRead(n1.id, other.id, { conn }), false, 'ไม่ใช่เจ้าของ');
  assert.equal((await notifications.findById(n1.id, { conn })).isRead, false);
  assert.equal(await notifications.markRead(n1.id, user.id, { conn }), true);
  const read = await notifications.findById(n1.id, { conn });
  assert.equal(read.isRead, true);
  assert.ok(read.readAt instanceof Date);
  assert.equal(await notifications.markRead(n1.id, user.id, { conn }), true);
  assert.equal((await notifications.findById(n1.id, { conn })).readAt.getTime(), read.readAt.getTime());
  assert.equal(await notifications.markRead(999999, user.id, { conn }), false);

  assert.equal(await notifications.markAllRead(user.id, { conn }), 2);
  assert.equal(await notifications.markAllRead(user.id, { conn }), 0);
  assert.equal(await notifications.countUnreadByUser(user.id, { conn }), 0);
}));
