import { closePool, rollbackTest, fromNow, HOUR, MINUTE } from '../helpers/testDb.js';
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { loans, reservations, notifications } from '../../src/models/index.js';
import { createNotebook, createUser } from '../helpers/fixtures.js';

after(closePool);

const LOAN_FIELDS = [
  'id', 'userId', 'userFullName', 'notebookId', 'assetCode', 'modelName', 'reservationId', 'borrowedAt', 'dueAt',
  'returnRequestedAt', 'returnedAt', 'receivedBy', 'returnCondition', 'returnNote', 'cancelledAt', 'cancelledBy',
  'cancelReason', 'loanStatus', 'isLate', 'createdAt', 'updatedAt',
];
const ADMIN_ID = 1;

async function setup(conn) {
  return { user: await createUser(conn), nb: await createNotebook(conn) };
}

function borrow(conn, user, nb, borrowedOffset = -HOUR, dueOffset = HOUR, extra = {}) {
  return loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: fromNow(borrowedOffset), dueAt: fromNow(dueOffset), ...extra }, { conn });
}

test('insert แล้ว findById ได้ field ครบ สถานะ borrowing และ isLate เป็น Boolean', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const loan = await borrow(conn, user, nb);
  assert.deepEqual(Object.keys(loan).sort(), [...LOAN_FIELDS].sort());
  assert.equal(loan.loanStatus, 'borrowing');
  assert.equal(loan.isLate, false);
  assert.ok(loan.dueAt instanceof Date);
  assert.equal(loan.assetCode, nb.assetCode);
  assert.deepEqual(await loans.findById(loan.id, { conn }), loan);
  assert.equal(await loans.findById(999999, { conn }), null);
}));

test('เกินกำหนดแล้วสถานะ overdue และ isLate = true', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const loan = await borrow(conn, user, nb, -3 * HOUR, -HOUR);
  assert.equal(loan.loanStatus, 'overdue');
  assert.equal(loan.isLate, true);
}));

describe('guard สถานะ', () => {
  test('requestReturn → return_pending, กดคืนซ้ำคืน null, ต่อเวลาหลังกดคืนคืน null', rollbackTest(async (conn) => {
    const { user, nb } = await setup(conn);
    const loan = await borrow(conn, user, nb);
    const requested = await loans.requestReturn(loan.id, {}, { conn });
    assert.equal(requested.loanStatus, 'return_pending');
    assert.ok(requested.returnRequestedAt instanceof Date);
    assert.equal(await loans.requestReturn(loan.id, {}, { conn }), null);
    assert.equal(await loans.extendDueAt(loan.id, fromNow(2 * HOUR), { conn }), null);
  }));

  test('confirmReturn ได้แม้สมาชิกไม่กดคืน, รับคืนซ้ำ / ยกเลิกหลังรับคืน / กดคืนหลังรับคืน คืน null', rollbackTest(async (conn) => {
    const { user, nb } = await setup(conn);
    const loan = await borrow(conn, user, nb);
    const returned = await loans.confirmReturn(loan.id, { receivedBy: ADMIN_ID, returnCondition: 'damaged', returnNote: 'จอแตก' }, { conn });
    assert.equal(returned.loanStatus, 'returned');
    assert.equal(returned.returnCondition, 'damaged');
    assert.equal(returned.returnNote, 'จอแตก');
    assert.equal(returned.receivedBy, ADMIN_ID);
    assert.equal(await loans.confirmReturn(loan.id, { receivedBy: ADMIN_ID, returnCondition: 'normal' }, { conn }), null);
    assert.equal(await loans.cancel(loan.id, { cancelledBy: ADMIN_ID }, { conn }), null);
    assert.equal(await loans.requestReturn(loan.id, {}, { conn }), null);
  }));

  test('cancel → cancelled แล้วทำอะไรต่อไม่ได้', rollbackTest(async (conn) => {
    const { user, nb } = await setup(conn);
    const loan = await borrow(conn, user, nb);
    const cancelled = await loans.cancel(loan.id, { cancelledBy: ADMIN_ID, reason: 'บันทึกผิด' }, { conn });
    assert.equal(cancelled.loanStatus, 'cancelled');
    assert.equal(cancelled.cancelReason, 'บันทึกผิด');
    assert.equal(cancelled.isLate, false);
    assert.equal(await loans.cancel(loan.id, { cancelledBy: ADMIN_ID }, { conn }), null);
    assert.equal(await loans.confirmReturn(loan.id, { receivedBy: ADMIN_ID, returnCondition: 'normal' }, { conn }), null);
    assert.equal(await loans.extendDueAt(loan.id, fromNow(2 * HOUR), { conn }), null);
  }));

  test('ไม่พบคืน null', rollbackTest(async (conn) => {
    assert.equal(await loans.requestReturn(999999, {}, { conn }), null);
    assert.equal(await loans.extendDueAt(999999, fromNow(HOUR), { conn }), null);
    assert.equal(await loans.confirmReturn(999999, { receivedBy: ADMIN_ID, returnCondition: 'normal' }, { conn }), null);
    assert.equal(await loans.cancel(999999, { cancelledBy: ADMIN_ID }, { conn }), null);
  }));
});

test('extendDueAt เลื่อนกำหนดคืน, รวมเกิน 24 ชม. → CHECK_FAILED', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const loan = await borrow(conn, user, nb, -HOUR, HOUR);
  const newDue = fromNow(5 * HOUR);
  assert.equal((await loans.extendDueAt(loan.id, newDue, { conn })).dueAt.getTime(), newDue.getTime());
  await assert.rejects(loans.extendDueAt(loan.id, new Date(loan.borrowedAt.getTime() + 24 * HOUR + MINUTE), { conn }), {
    code: 'CHECK_FAILED',
    constraint: 'chk_loans_due',
  });
}));

test('คืนช้าตัดสินจากเวลาที่สมาชิกกดคืน ไม่ใช่เวลาที่แอดมินยืนยัน', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const onTime = await borrow(conn, user, nb, -3 * HOUR, -HOUR);
  await loans.requestReturn(onTime.id, { at: fromNow(-2 * HOUR) }, { conn });
  const confirmed = await loans.confirmReturn(onTime.id, { receivedBy: ADMIN_ID, returnCondition: 'normal' }, { conn });
  assert.equal(confirmed.isLate, false);

  const nb2 = await createNotebook(conn);
  const late = await borrow(conn, user, nb2, -3 * HOUR, -HOUR);
  assert.equal((await loans.requestReturn(late.id, {}, { conn })).isLate, true);
}));

test('error: เครื่องถูกยืมอยู่ → DUPLICATE, เกิน 24 ชม. → CHECK_FAILED, reservation ไม่ตรงผู้ยืม → FK_NOT_FOUND', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  await borrow(conn, user, nb);
  await assert.rejects(borrow(conn, user, nb), { code: 'DUPLICATE', constraint: 'uq_loans_active_notebook' });

  const nb2 = await createNotebook(conn);
  await assert.rejects(borrow(conn, user, nb2, 0, 25 * HOUR), { code: 'CHECK_FAILED', constraint: 'chk_loans_due' });

  const other = await createUser(conn);
  const res = await reservations.insert({ userId: other.id, notebookId: nb2.id, startAt: fromNow(-MINUTE), endAt: fromNow(HOUR) }, { conn });
  await assert.rejects(borrow(conn, user, nb2, 0, HOUR, { reservationId: res.id }), { code: 'FK_NOT_FOUND', constraint: 'fk_loans_reservation' });
  await assert.rejects(loans.insert({ userId: user.id, notebookId: nb2.id, borrowedAt: fromNow(0), dueAt: fromNow(HOUR), loanStatus: 'returned' }, { conn }), {
    code: 'INVALID_COLUMN',
  });
}));

test('รับคืนแล้วยืมเครื่องเดิมได้อีก (unique เฉพาะรายการที่ยังไม่รับคืน)', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const first = await borrow(conn, user, nb, -2 * HOUR, -HOUR);
  await loans.confirmReturn(first.id, { receivedBy: ADMIN_ID, returnCondition: 'normal' }, { conn });
  assert.ok(await borrow(conn, user, nb, 0, HOUR));
}));

test('findActiveByNotebook / countActiveByUser', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  assert.equal(await loans.findActiveByNotebook(nb.id, { conn }), null);
  assert.equal(await loans.countActiveByUser(user.id, { conn }), 0);
  const loan = await borrow(conn, user, nb);
  await loans.requestReturn(loan.id, {}, { conn });
  assert.equal((await loans.findActiveByNotebook(nb.id, { conn })).id, loan.id, 'กดคืนแล้วแต่ยังไม่ยืนยัน ยังนับว่าค้าง');
  assert.equal(await loans.countActiveByUser(user.id, { conn }), 1);
  await loans.confirmReturn(loan.id, { receivedBy: ADMIN_ID, returnCondition: 'normal' }, { conn });
  assert.equal(await loans.findActiveByNotebook(nb.id, { conn }), null);
  assert.equal(await loans.countActiveByUser(user.id, { conn }), 0);
}));

describe('findOverlapping: ช่วงเวลาทับกัน', () => {
  // การยืมที่มีอยู่: [-1h, +2h)
  const cases = [
    ['ทับบางส่วนด้านซ้าย', -2, 0, true],
    ['ทับบางส่วนด้านขวา', 1, 3, true],
    ['ครอบทั้งช่วง', -2, 3, true],
    ['อยู่ข้างใน', 0, 1, true],
    ['ชนขอบขวาพอดี (start = dueAt) ไม่นับ', 2, 4, false],
    ['ชนขอบซ้ายพอดี (end = borrowedAt) ไม่นับ', -3, -1, false],
  ];
  for (const [name, from, to, overlaps] of cases) {
    test(name, rollbackTest(async (conn) => {
      const { user, nb } = await setup(conn);
      const base = fromNow(0).getTime();
      const at = (h) => new Date(base + h * HOUR);
      const loan = await loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: at(-1), dueAt: at(2) }, { conn });
      assert.deepEqual((await loans.findOverlapping(nb.id, at(from), at(to), { conn })).map((l) => l.id), overlaps ? [loan.id] : []);
    }));
  }

  test('ไม่นับรายการที่รับคืนแล้ว / ยกเลิก และ excludeId ได้', rollbackTest(async (conn) => {
    const { user, nb } = await setup(conn);
    const returned = await borrow(conn, user, nb, -HOUR, 2 * HOUR);
    await loans.confirmReturn(returned.id, { receivedBy: ADMIN_ID, returnCondition: 'normal' }, { conn });
    const cancelled = await borrow(conn, user, nb, -HOUR, 2 * HOUR);
    await loans.cancel(cancelled.id, { cancelledBy: ADMIN_ID }, { conn });
    assert.deepEqual(await loans.findOverlapping(nb.id, fromNow(0), fromNow(HOUR), { conn }), []);
    const live = await borrow(conn, user, nb, -HOUR, 2 * HOUR);
    assert.deepEqual(await loans.findOverlapping(nb.id, fromNow(0), fromNow(HOUR), { excludeId: live.id, conn }), []);
  }));
});

test('findDueSoon: ครบกำหนดภายใน X นาที ยังไม่กดคืน ไม่แจ้งซ้ำ และแจ้งใหม่หลังต่อเวลา', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const soon = await borrow(conn, user, await createNotebook(conn), -HOUR, 30 * MINUTE);
  const later = await borrow(conn, user, await createNotebook(conn), -HOUR, 3 * HOUR);
  const requested = await borrow(conn, user, await createNotebook(conn), -HOUR, 20 * MINUTE);
  await loans.requestReturn(requested.id, {}, { conn });
  const ids = async () => (await loans.findDueSoon(60, { conn })).map((l) => l.id);

  assert.deepEqual(await ids(), [soon.id]);
  assert.ok(!(await ids()).includes(later.id));
  await notifications.insertIfNotExists({ type: 'loan_due_soon', loanId: soon.id, refDueAt: soon.dueAt }, { conn });
  assert.deepEqual(await ids(), []);
  await loans.extendDueAt(soon.id, fromNow(50 * MINUTE), { conn });
  assert.deepEqual(await ids(), [soon.id], 'dueAt ใหม่ยังไม่มีแจ้งเตือน');
}));

test('findOverdueWithoutNotice', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const overdue = await borrow(conn, user, await createNotebook(conn), -3 * HOUR, -HOUR);
  await borrow(conn, user, await createNotebook(conn), -HOUR, HOUR);
  const ids = async () => (await loans.findOverdueWithoutNotice({ conn })).map((l) => l.id);
  assert.deepEqual(await ids(), [overdue.id]);
  await notifications.insertIfNotExists({ type: 'loan_overdue', loanId: overdue.id, refDueAt: overdue.dueAt }, { conn });
  assert.deepEqual(await ids(), []);
}));

test('list / listByUser / listPendingReturn: กรองและเรียงถูก', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const a = await borrow(conn, user, await createNotebook(conn), -5 * HOUR, -4 * HOUR); // overdue
  const b = await borrow(conn, user, await createNotebook(conn), -3 * HOUR, 2 * HOUR);
  const c = await borrow(conn, user, await createNotebook(conn), -2 * HOUR, HOUR);
  await loans.requestReturn(c.id, { at: fromNow(-30 * MINUTE) }, { conn });
  await loans.requestReturn(b.id, { at: fromNow(-10 * MINUTE) }, { conn });

  const mine = await loans.listByUser(user.id, { sort: 'borrowedAt:asc' }, { conn });
  assert.equal(mine.total, 3);
  assert.deepEqual(mine.rows.map((l) => l.id), [a.id, b.id, c.id]);
  assert.deepEqual((await loans.listByUser(user.id, { sort: 'dueAt:desc' }, { conn })).rows.map((l) => l.id), [b.id, c.id, a.id]);
  assert.deepEqual((await loans.list({ userId: user.id, status: 'overdue' }, { conn })).rows.map((l) => l.id), [a.id]);
  assert.deepEqual((await loans.list({ userId: user.id, isLate: true }, { conn })).rows.map((l) => l.id), [a.id]);
  assert.deepEqual(
    (await loans.list({ userId: user.id, from: fromNow(-3 * HOUR), to: fromNow(-2 * HOUR), sort: 'borrowedAt:asc' }, { conn })).rows.map((l) => l.id),
    [b.id, c.id],
  );

  const pending = await loans.listPendingReturn({}, { conn });
  assert.deepEqual(pending.rows.filter((l) => l.userId === user.id).map((l) => l.id), [c.id, b.id], 'กดคืนก่อนอยู่ก่อน');
  await assert.rejects(loans.list({ sort: 'loanStatus:asc' }, { conn }), { code: 'INVALID_COLUMN' });
}));
