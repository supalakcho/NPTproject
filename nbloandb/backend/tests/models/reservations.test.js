import { closePool, rollbackTest, fromNow, HOUR, MINUTE } from '../helpers/testDb.js';
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { reservations, loans, notifications } from '../../src/models/index.js';
import { createNotebook, createUser } from '../helpers/fixtures.js';

after(closePool);

const RESERVATION_FIELDS = [
  'id', 'userId', 'userFullName', 'notebookId', 'assetCode', 'modelName', 'startAt', 'endAt', 'status', 'loanId',
  'cancelledAt', 'cancelledBy', 'cancelReason', 'createdAt', 'updatedAt',
];

async function setup(conn) {
  return { user: await createUser(conn), nb: await createNotebook(conn) };
}

test('insert แล้ว findById ได้ field ครบ และวันเวลาเป็น Date ตรงกับที่ส่ง', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const startAt = fromNow(2 * HOUR);
  const endAt = fromNow(5 * HOUR);
  const res = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt, endAt }, { conn });
  assert.deepEqual(Object.keys(res).sort(), [...RESERVATION_FIELDS].sort());
  assert.equal(res.startAt.getTime(), startAt.getTime());
  assert.equal(res.endAt.getTime(), endAt.getTime());
  assert.equal(res.status, 'upcoming');
  assert.equal(res.userFullName, 'ทดสอบ ระบบ');
  assert.equal(res.assetCode, nb.assetCode);
  assert.equal(res.loanId, null);
  assert.deepEqual(await reservations.findById(res.id, { conn }), res);
  assert.equal(await reservations.findById(999999, { conn }), null);
}));

test('status คำนวณจาก SQL: upcoming / active / expired / cancelled / fulfilled', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const insert = (startOffset, endOffset) =>
    reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(startOffset), endAt: fromNow(endOffset) }, { conn });

  const upcoming = await insert(1 * HOUR, 2 * HOUR);
  const active = await insert(-10 * MINUTE, 3 * HOUR); // เริ่มแล้ว 10 นาที ยังอยู่ในช่วงผ่อนผัน 30 นาที
  const expired = await insert(-40 * MINUTE, 4 * HOUR); // เกินช่วงผ่อนผัน ไม่มารับ
  const cancelled = await insert(5 * HOUR, 6 * HOUR);
  await reservations.cancel(cancelled.id, { cancelledBy: user.id }, { conn });
  const fulfilled = await insert(-5 * MINUTE, 7 * HOUR);
  const loan = await loans.insert(
    { userId: user.id, notebookId: nb.id, borrowedAt: fromNow(-MINUTE), dueAt: fromNow(HOUR), reservationId: fulfilled.id },
    { conn },
  );

  const status = async (r) => (await reservations.findById(r.id, { conn })).status;
  assert.equal(await status(upcoming), 'upcoming');
  assert.equal(await status(active), 'active');
  assert.equal(await status(expired), 'expired');
  assert.equal(await status(cancelled), 'cancelled');
  assert.equal(await status(fulfilled), 'fulfilled');
  assert.equal((await reservations.findById(fulfilled.id, { conn })).loanId, loan.id);
}));

describe('findOverlapping: ช่วงเวลาทับกัน', () => {
  // การจองที่มีอยู่: [+10h, +12h)
  const cases = [
    ['ทับบางส่วนด้านซ้าย', 9, 11, true],
    ['ทับบางส่วนด้านขวา', 11, 13, true],
    ['ครอบทั้งช่วง', 9, 13, true],
    ['อยู่ข้างใน', 10.5, 11.5, true],
    ['ช่วงเดียวกันพอดี', 10, 12, true],
    ['ชนขอบซ้ายพอดี (end = start) ไม่นับ', 8, 10, false],
    ['ชนขอบขวาพอดี (start = end) ไม่นับ', 12, 14, false],
    ['ไม่ทับเลย', 14, 15, false],
  ];
  for (const [name, from, to, overlaps] of cases) {
    test(name, rollbackTest(async (conn) => {
      const { user, nb } = await setup(conn);
      const base = fromNow(0).getTime();
      const at = (h) => new Date(base + h * HOUR);
      const existing = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: at(10), endAt: at(12) }, { conn });
      const found = await reservations.findOverlapping(nb.id, at(from), at(to), { conn });
      assert.deepEqual(found.map((r) => r.id), overlaps ? [existing.id] : []);
    }));
  }

  test('ไม่นับการจองที่ยกเลิก / หมดอายุ / รับเครื่องแล้ว / ของเครื่องอื่น และ excludeId ได้', rollbackTest(async (conn) => {
    const { user, nb } = await setup(conn);
    const other = await createNotebook(conn);
    const ins = (notebookId, s, e) => reservations.insert({ userId: user.id, notebookId, startAt: fromNow(s), endAt: fromNow(e) }, { conn });

    const cancelled = await ins(nb.id, 1 * HOUR, 3 * HOUR);
    await reservations.cancel(cancelled.id, { cancelledBy: user.id }, { conn });
    await ins(nb.id, -60 * MINUTE, 3 * HOUR); // หมดอายุ
    const fulfilled = await ins(nb.id, -5 * MINUTE, 3 * HOUR);
    await loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: fromNow(-MINUTE), dueAt: fromNow(HOUR), reservationId: fulfilled.id }, { conn });
    await ins(other.id, 1 * HOUR, 3 * HOUR);
    assert.deepEqual(await reservations.findOverlapping(nb.id, fromNow(0), fromNow(4 * HOUR), { conn }), []);

    const live = await ins(nb.id, 2 * HOUR, 3 * HOUR);
    assert.deepEqual((await reservations.findOverlapping(nb.id, fromNow(0), fromNow(4 * HOUR), { conn })).map((r) => r.id), [live.id]);
    assert.deepEqual(await reservations.findOverlapping(nb.id, fromNow(0), fromNow(4 * HOUR), { excludeId: live.id, conn }), []);
  }));
});

test('findStartingSoon: เริ่มภายใน X นาที ยังไม่เคยแจ้งเตือน', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const soon = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(30 * MINUTE), endAt: fromNow(2 * HOUR) }, { conn });
  const later = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(3 * HOUR), endAt: fromNow(4 * HOUR) }, { conn });
  const ids = async () => (await reservations.findStartingSoon(60, { conn })).map((r) => r.id);

  assert.ok((await ids()).includes(soon.id));
  assert.ok(!(await ids()).includes(later.id));
  await notifications.insertIfNotExists({ type: 'reservation_starting', reservationId: soon.id }, { conn });
  assert.ok(!(await ids()).includes(soon.id), 'แจ้งเตือนแล้วไม่ดึงซ้ำ');
}));

test('cancel: guard กันยกเลิกซ้ำ / ยกเลิกรายการที่รับเครื่องแล้ว / ไม่พบ', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const res = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(HOUR), endAt: fromNow(2 * HOUR) }, { conn });
  const cancelled = await reservations.cancel(res.id, { cancelledBy: user.id, reason: 'ติดธุระ' }, { conn });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelReason, 'ติดธุระ');
  assert.equal(cancelled.cancelledBy, user.id);
  assert.ok(cancelled.cancelledAt instanceof Date);
  assert.equal(await reservations.cancel(res.id, { cancelledBy: user.id }, { conn }), null, 'ยกเลิกซ้ำ');

  const picked = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(-MINUTE), endAt: fromNow(HOUR) }, { conn });
  await loans.insert({ userId: user.id, notebookId: nb.id, borrowedAt: fromNow(0), dueAt: fromNow(HOUR), reservationId: picked.id }, { conn });
  assert.equal(await reservations.cancel(picked.id, { cancelledBy: 1 }, { conn }), null, 'รับเครื่องแล้ว');
  assert.equal(await reservations.cancel(999999, { cancelledBy: 1 }, { conn }), null, 'ไม่พบ');
}));

test('list / listByUser: กรอง status, notebookId, from/to และ sort', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const other = await createUser(conn);
  const r1 = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(1 * HOUR), endAt: fromNow(2 * HOUR) }, { conn });
  const r2 = await reservations.insert({ userId: user.id, notebookId: nb.id, startAt: fromNow(3 * HOUR), endAt: fromNow(4 * HOUR) }, { conn });
  const r3 = await reservations.insert({ userId: other.id, notebookId: nb.id, startAt: fromNow(5 * HOUR), endAt: fromNow(6 * HOUR) }, { conn });
  await reservations.cancel(r2.id, { cancelledBy: user.id }, { conn });

  const mine = await reservations.listByUser(user.id, { sort: 'startAt:asc' }, { conn });
  assert.equal(mine.total, 2);
  assert.deepEqual(mine.rows.map((r) => r.id), [r1.id, r2.id]);
  assert.deepEqual((await reservations.listByUser(user.id, { status: 'cancelled' }, { conn })).rows.map((r) => r.id), [r2.id]);

  const all = await reservations.list({ notebookId: nb.id, sort: 'startAt:desc' }, { conn });
  assert.deepEqual(all.rows.map((r) => r.id), [r3.id, r2.id, r1.id]);
  const ranged = await reservations.list({ notebookId: nb.id, from: fromNow(2 * HOUR), to: fromNow(5 * HOUR), sort: 'startAt:asc' }, { conn });
  assert.deepEqual(ranged.rows.map((r) => r.id), [r2.id, r3.id]);
  await assert.rejects(reservations.list({ sort: 'status:asc' }, { conn }), { code: 'INVALID_COLUMN' });
}));

test('error: ช่วงผิด → CHECK_FAILED, ผู้ใช้/เครื่องไม่มีจริง → FK_NOT_FOUND', rollbackTest(async (conn) => {
  const { user, nb } = await setup(conn);
  const ins = (data) => reservations.insert({ userId: user.id, notebookId: nb.id, ...data }, { conn });
  await assert.rejects(ins({ startAt: fromNow(2 * HOUR), endAt: fromNow(HOUR) }), { code: 'CHECK_FAILED', constraint: 'chk_res_period' });
  await assert.rejects(ins({ startAt: fromNow(HOUR), endAt: fromNow(HOUR + 24 * HOUR + MINUTE) }), { code: 'CHECK_FAILED' });
  assert.ok(await ins({ startAt: fromNow(HOUR), endAt: fromNow(25 * HOUR) }), '24 ชม. พอดีทำได้');
  await assert.rejects(ins({ notebookId: 999999, startAt: fromNow(HOUR), endAt: fromNow(2 * HOUR) }), { code: 'FK_NOT_FOUND' });
}));
