import {
  closePool, memberCtx, adminCtx, createNotebook, insertLoan, insertReservation, lastAudit, code, HOUR, MINUTE,
} from '../helpers/serviceEnv.js';
import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { notifications, notebooks as notebookModel } from '../../src/models/index.js';
import { reservations } from '../../src/services/index.js';
import { setNowForTest } from '../../src/services/core/clock.js';

after(closePool);
afterEach(() => setNowForTest(null));

const DAY = 24 * HOUR;
// เวลาฐานที่ไม่มีเศษวินาที แล้วตรึง clock ไว้ที่ค่านี้ เพื่อทดสอบขอบให้แม่นยำ
function freeze() {
  const t = new Date();
  t.setMilliseconds(0);
  setNowForTest(t);
  return t.getTime();
}
const at = (t, ms) => new Date(t + ms).toISOString();

test('create: สำเร็จ ได้ status upcoming, pickupDeadline = startAt + 30 นาที, audit CREATE', async () => {
  const { user, ctx } = await memberCtx();
  const nb = await createNotebook();
  const t = freeze();
  const r = await reservations.create(ctx, { notebookId: nb.id, startAt: at(t, 2 * DAY), endAt: at(t, 2 * DAY + 4 * HOUR) });
  assert.equal(r.userId, user.id);
  assert.equal(r.status, 'upcoming');
  assert.equal(r.pickupDeadline - r.startAt, 30 * MINUTE);
  const log = await lastAudit({ targetTable: 'reservations', targetId: r.id });
  assert.equal(log.action, 'CREATE');
  assert.equal(log.newValues.notebookId, nb.id);
});

test('create กฎเวลา: อดีต/ตอนนี้, end ≤ start, เกิน 24 ชม., ขอบ 7 วันพอดีได้ เกิน 1 วินาทีไม่ได้, ยาวพอดี 24 ชม.ได้', async () => {
  const { ctx } = await memberCtx();
  const nb = await createNotebook();
  const t = freeze();
  const make = (s, e) => reservations.create(ctx, { notebookId: nb.id, startAt: at(t, s), endAt: at(t, e) });
  await assert.rejects(make(0, HOUR), code('INVALID_TIME_RANGE'));
  await assert.rejects(make(-HOUR, HOUR), code('INVALID_TIME_RANGE'));
  await assert.rejects(make(2 * HOUR, 2 * HOUR), code('INVALID_TIME_RANGE'));
  await assert.rejects(make(2 * HOUR, HOUR), code('INVALID_TIME_RANGE'));
  await assert.rejects(make(2 * HOUR, 26 * HOUR + 1000), code('INVALID_TIME_RANGE'));
  await assert.rejects(make(7 * DAY + 1000, 7 * DAY + HOUR), code('RESERVATION_TOO_FAR_AHEAD'));
  assert.ok(await make(7 * DAY, 7 * DAY + HOUR)); // ขอบ 7 วันพอดี
  assert.ok(await make(DAY, 2 * DAY)); // ยาวพอดี 24 ชม.
});

test('create ทับซ้อน: ทับการจอง = RESERVATION_CONFLICT · ชนขอบพอดีไม่นับ · ทับการยืม = LOAN_CONFLICT', async () => {
  const a = await memberCtx();
  const b = await memberCtx();
  const nb = await createNotebook();
  const t = freeze();
  await reservations.create(a.ctx, { notebookId: nb.id, startAt: at(t, DAY), endAt: at(t, DAY + 2 * HOUR) });
  const make = (s, e) => reservations.create(b.ctx, { notebookId: nb.id, startAt: at(t, s), endAt: at(t, e) });
  await assert.rejects(make(DAY + HOUR, DAY + 3 * HOUR), code('RESERVATION_CONFLICT'));
  await assert.rejects(make(DAY - HOUR, DAY + 3 * HOUR), code('RESERVATION_CONFLICT')); // ครอบทั้งช่วง
  assert.ok(await make(DAY + 2 * HOUR, DAY + 3 * HOUR)); // เริ่มตอนที่อีกการจองจบพอดี
  assert.ok(await make(DAY - HOUR, DAY)); // จบตอนที่อีกการจองเริ่มพอดี

  const busy = await createNotebook();
  setNowForTest(null);
  await insertLoan(a.user, busy, -HOUR, 5 * HOUR);
  await assert.rejects(
    reservations.create(b.ctx, { notebookId: busy.id, startAt: at(Date.now(), 2 * HOUR), endAt: at(Date.now(), 3 * HOUR) }),
    code('LOAN_CONFLICT'),
  );
});

test('create: เครื่องไม่มี/ถูกลบ = NOTEBOOK_NOT_FOUND · สภาพไม่ปกติ = NOTEBOOK_NOT_AVAILABLE · แอดมินจองได้ (seed ให้ทุกสิทธิ์)', async () => {
  const { ctx } = await memberCtx();
  const t = freeze();
  const range = { startAt: at(t, DAY), endAt: at(t, DAY + HOUR) };
  await assert.rejects(reservations.create(ctx, { notebookId: 999999, ...range }), code('NOTEBOOK_NOT_FOUND'));
  const deleted = await createNotebook();
  await notebookModel.softDelete(deleted.id);
  await assert.rejects(reservations.create(ctx, { notebookId: deleted.id, ...range }), code('NOTEBOOK_NOT_FOUND'));
  const broken = await createNotebook({ conditionStatus: 'damaged' });
  await assert.rejects(reservations.create(ctx, { notebookId: broken.id, ...range }), code('NOTEBOOK_NOT_AVAILABLE'));
  const admin = await adminCtx();
  // seed ให้แอดมินได้ทุกสิทธิ์ รวม reservation.create จึงจองได้
  assert.ok(await reservations.create(admin.ctx, { notebookId: (await createNotebook()).id, ...range }));
});

test('คำขอพร้อมกัน: 2 คนจองช่วงเดียวกันพร้อมกัน สำเร็จ 1 อีก 1 ได้ RESERVATION_CONFLICT', async () => {
  const a = await memberCtx();
  const b = await memberCtx();
  const nb = await createNotebook();
  const t = freeze();
  const input = { notebookId: nb.id, startAt: at(t, DAY), endAt: at(t, DAY + HOUR) };
  const results = await Promise.allSettled([reservations.create(a.ctx, input), reservations.create(b.ctx, input)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'RESERVATION_CONFLICT');
});

test('cancel: เจ้าของยกเลิกเองได้ (ไม่ต้องมีเหตุผล) · ยกเลิกซ้ำไม่ได้ · ไม่สร้างแจ้งเตือน', async () => {
  const { user, ctx } = await memberCtx();
  const nb = await createNotebook();
  const t = freeze();
  const r = await reservations.create(ctx, { notebookId: nb.id, startAt: at(t, DAY), endAt: at(t, DAY + HOUR) });
  const cancelled = await reservations.cancel(ctx, r.id, {});
  assert.equal(cancelled.status, 'cancelled');
  const log = await lastAudit({ targetTable: 'reservations', targetId: r.id });
  assert.equal(log.newValues.event, 'cancel');
  assert.equal(log.userId, user.id);
  await assert.rejects(reservations.cancel(ctx, r.id, {}), code('RESERVATION_CANNOT_CANCEL'));
  assert.equal((await notifications.listByUser(user.id)).total, 0);
});

test('cancel: สมาชิกยกเลิกของคนอื่น = 404 · แอดมินต้องมีเหตุผล และเจ้าของได้แจ้งเตือน reservation_cancelled', async () => {
  const owner = await memberCtx();
  const other = await memberCtx();
  const admin = await adminCtx();
  const nb = await createNotebook();
  const t = freeze();
  const r = await reservations.create(owner.ctx, { notebookId: nb.id, startAt: at(t, DAY), endAt: at(t, DAY + HOUR) });
  await assert.rejects(reservations.cancel(other.ctx, r.id, { reason: 'x' }), code('RESERVATION_NOT_FOUND'));
  await assert.rejects(reservations.cancel(admin.ctx, r.id, {}), code('VALIDATION_ERROR'));
  const cancelled = await reservations.cancel(admin.ctx, r.id, { reason: 'เครื่องส่งซ่อม' });
  assert.equal(cancelled.cancelReason, 'เครื่องส่งซ่อม');
  const { rows } = await notifications.listByUser(owner.user.id);
  assert.deepEqual(rows.map((n) => n.type), ['reservation_cancelled']);
});

test('cancel: การจองที่หมดอายุแล้วยกเลิกไม่ได้', async () => {
  const { user, ctx } = await memberCtx();
  const r = await insertReservation(user, await createNotebook(), -3 * HOUR, -2 * HOUR);
  await assert.rejects(reservations.cancel(ctx, r.id, {}), code('RESERVATION_CANNOT_CANCEL'));
});

test('อ่าน: listMine เห็นเฉพาะของตัวเอง · getById ของคนอื่น = 404 แต่แอดมินเห็น · listAll เฉพาะแอดมิน', async () => {
  const a = await memberCtx();
  const b = await memberCtx();
  const admin = await adminCtx();
  const t = freeze();
  const r = await reservations.create(a.ctx, { notebookId: (await createNotebook()).id, startAt: at(t, DAY), endAt: at(t, DAY + HOUR) });
  const mine = await reservations.listMine(a.ctx, { status: 'upcoming', sort: 'startAt:asc' });
  assert.deepEqual(mine.rows.map((x) => x.id), [r.id]);
  assert.equal((await reservations.listMine(b.ctx)).total, 0);
  await assert.rejects(reservations.getById(b.ctx, r.id), code('RESERVATION_NOT_FOUND'));
  assert.equal((await reservations.getById(admin.ctx, r.id)).id, r.id);
  assert.equal((await reservations.listAll(admin.ctx, { userId: a.user.id })).total, 1);
  await assert.rejects(reservations.listAll(a.ctx), code('FORBIDDEN'));
  await assert.rejects(reservations.listMine(a.ctx, { status: 'bogus' }), code('VALIDATION_ERROR'));
});
