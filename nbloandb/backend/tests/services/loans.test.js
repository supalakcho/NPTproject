import {
  closePool, memberCtx, adminCtx, createNotebook, insertLoan, insertReservation, lastAudit, code, fromNow, HOUR, MINUTE,
} from '../helpers/serviceEnv.js';
import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { notifications, reservations, notebooks as notebookModel } from '../../src/models/index.js';
import { loans, notebooks } from '../../src/services/index.js';

after(closePool);

const due = (ms) => fromNow(ms).toISOString();

describe('borrowNow ยืมทันที', () => {
  test('สำเร็จ: สถานะ borrowing, เครื่องกลายเป็น borrowed, มี actions, audit CREATE event borrow', async () => {
    const { user, ctx } = await memberCtx();
    const nb = await createNotebook();
    const loan = await loans.borrowNow(ctx, { notebookId: nb.id, dueAt: due(4 * HOUR) });
    assert.equal(loan.userId, user.id);
    assert.equal(loan.loanStatus, 'borrowing');
    assert.equal(loan.isLate, false);
    assert.equal(loan.actions.canExtend, true);
    assert.equal(loan.actions.canRequestReturn, true);
    assert.equal(loan.actions.maxExtendDueAt - loan.borrowedAt, 24 * HOUR);
    assert.equal((await notebooks.getById(ctx, nb.id)).currentStatus, 'borrowed');
    const log = await lastAudit({ targetTable: 'loans', targetId: loan.id });
    assert.equal(log.action, 'CREATE');
    assert.equal(log.newValues.event, 'borrow');
  });

  test('ยืมด้วย assetCode จากการสแกน (ตัวพิมพ์เล็กได้)', async () => {
    const { ctx } = await memberCtx();
    const nb = await createNotebook();
    const loan = await loans.borrowNow(ctx, { assetCode: nb.assetCode.toLowerCase(), dueAt: due(HOUR) });
    assert.equal(loan.notebookId, nb.id);
    await assert.rejects(loans.borrowNow(ctx, { dueAt: due(HOUR) }), code('VALIDATION_ERROR'));
    await assert.rejects(loans.borrowNow(ctx, { assetCode: 'NOPE-999', dueAt: due(HOUR) }), code('NOTEBOOK_NOT_FOUND'));
  });

  test('dueAt: อยู่ในอดีต/ตอนนี้ หรือเกิน 24 ชม. = INVALID_DUE_AT · พอดี 24 ชม. ได้', async () => {
    const { ctx } = await memberCtx();
    const nb = await createNotebook();
    await assert.rejects(loans.borrowNow(ctx, { notebookId: nb.id, dueAt: due(-MINUTE) }), code('INVALID_DUE_AT'));
    await assert.rejects(loans.borrowNow(ctx, { notebookId: nb.id, dueAt: due(24 * HOUR + 5 * MINUTE) }), code('INVALID_DUE_AT'));
    assert.ok(await loans.borrowNow(ctx, { notebookId: nb.id, dueAt: due(24 * HOUR - 5000) }));
  });

  test('เครื่องไม่มี/เสียหาย/ถูกยืม และยืมครบโควตา', async () => {
    const a = await memberCtx();
    const b = await memberCtx();
    await assert.rejects(loans.borrowNow(a.ctx, { notebookId: 999999, dueAt: due(HOUR) }), code('NOTEBOOK_NOT_FOUND'));
    const damaged = await createNotebook({ conditionStatus: 'damaged' });
    await assert.rejects(loans.borrowNow(a.ctx, { notebookId: damaged.id, dueAt: due(HOUR) }), code('NOTEBOOK_NOT_AVAILABLE'));
    const nb = await createNotebook();
    await loans.borrowNow(a.ctx, { notebookId: nb.id, dueAt: due(HOUR) });
    await assert.rejects(loans.borrowNow(b.ctx, { notebookId: nb.id, dueAt: due(HOUR) }), code('NOTEBOOK_ALREADY_BORROWED'));
    // maxActiveLoansPerUser = 1
    await assert.rejects(loans.borrowNow(a.ctx, { notebookId: (await createNotebook()).id, dueAt: due(HOUR) }), code('LOAN_LIMIT_REACHED'));
  });

  test('ทับการจองของคนอื่น = RESERVATION_CONFLICT (availableUntil) · ทับการจองตัวเอง = OWN_RESERVATION_OVERLAP', async () => {
    const owner = await memberCtx();
    const other = await memberCtx();
    const nb = await createNotebook();
    const r = await insertReservation(owner.user, nb, 3 * HOUR, 5 * HOUR);
    await assert.rejects(
      loans.borrowNow(other.ctx, { notebookId: nb.id, dueAt: due(4 * HOUR) }),
      (e) => e.code === 'RESERVATION_CONFLICT' && e.details.availableUntil.getTime() === r.startAt.getTime() && !JSON.stringify(e.details).includes('userFullName'),
    );
    await assert.rejects(
      loans.borrowNow(owner.ctx, { notebookId: nb.id, dueAt: due(4 * HOUR) }),
      (e) => e.code === 'OWN_RESERVATION_OVERLAP' && e.details.reservationId === r.id,
    );
    assert.ok(await loans.borrowNow(other.ctx, { notebookId: nb.id, dueAt: r.startAt.toISOString() })); // คืนตอนการจองเริ่มพอดีได้
  });

  test('คำขอพร้อมกัน: 2 คนยืมเครื่องเดียวกันพร้อมกัน สำเร็จ 1 อีก 1 ได้ NOTEBOOK_ALREADY_BORROWED', async () => {
    const a = await memberCtx();
    const b = await memberCtx();
    const nb = await createNotebook();
    const input = { notebookId: nb.id, dueAt: due(2 * HOUR) };
    const results = await Promise.allSettled([loans.borrowNow(a.ctx, input), loans.borrowNow(b.ctx, input)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'NOTEBOOK_ALREADY_BORROWED');
  });
});

describe('pickupReservation รับเครื่องตามที่จอง', () => {
  test('ในช่วงผ่อนผัน: ได้ loan ที่ dueAt = endAt และการจองเป็น fulfilled', async () => {
    const { user, ctx } = await memberCtx();
    const nb = await createNotebook();
    const r = await insertReservation(user, nb, -10 * MINUTE, 3 * HOUR);
    const loan = await loans.pickupReservation(ctx, r.id);
    assert.equal(loan.reservationId, r.id);
    assert.equal(loan.dueAt.getTime(), r.endAt.getTime());
    assert.equal((await lastAudit({ targetTable: 'loans', targetId: loan.id })).newValues.event, 'pickup');
    await assert.rejects(loans.pickupReservation(ctx, r.id), code('RESERVATION_ALREADY_PICKED_UP'));
  });

  test('ก่อนเวลาเริ่ม / หลังผ่อนผัน / ถูกยกเลิก / ของคนอื่น', async () => {
    const { user, ctx } = await memberCtx();
    const other = await memberCtx();
    const early = await insertReservation(user, await createNotebook(), HOUR, 2 * HOUR);
    await assert.rejects(loans.pickupReservation(ctx, early.id), code('RESERVATION_NOT_STARTED'));
    const late = await insertReservation(user, await createNotebook(), -40 * MINUTE, 2 * HOUR);
    await assert.rejects(loans.pickupReservation(ctx, late.id), code('RESERVATION_EXPIRED'));
    await assert.rejects(loans.pickupReservation(other.ctx, early.id), code('RESERVATION_NOT_FOUND'));
    const cancelled = await insertReservation(user, await createNotebook(), -5 * MINUTE, HOUR);
    await reservations.cancel(cancelled.id, { cancelledBy: user.id });
    await assert.rejects(loans.pickupReservation(ctx, cancelled.id), code('RESERVATION_CANCELLED'));
  });

  test('ผู้ยืมคนก่อนยังไม่คืน = NOTEBOOK_NOT_RETURNED_YET · เครื่องเสีย = NOTEBOOK_NOT_AVAILABLE', async () => {
    const { user, ctx } = await memberCtx();
    const previous = await memberCtx();
    const nb = await createNotebook();
    await insertLoan(previous.user, nb, -5 * HOUR, -20 * MINUTE); // เกินกำหนดแต่ยังไม่คืน
    const r = await insertReservation(user, nb, -5 * MINUTE, 2 * HOUR);
    await assert.rejects(loans.pickupReservation(ctx, r.id), code('NOTEBOOK_NOT_RETURNED_YET'));

    const broken = await createNotebook();
    const r2 = await insertReservation(user, broken, -5 * MINUTE, 2 * HOUR);
    await notebookModel.updateCondition(broken.id, 'maintenance');
    await assert.rejects(loans.pickupReservation(ctx, r2.id), code('NOTEBOOK_NOT_AVAILABLE'));
  });
});

describe('extend ต่อเวลา', () => {
  test('สำเร็จ: dueAt ใหม่ + audit เก็บกำหนดคืนเดิมและใหม่', async () => {
    const { ctx } = await memberCtx();
    const loan = await loans.borrowNow(ctx, { notebookId: (await createNotebook()).id, dueAt: due(2 * HOUR) });
    const newDueAt = new Date(loan.dueAt.getTime() + 3 * HOUR);
    const extended = await loans.extend(ctx, loan.id, { newDueAt: newDueAt.toISOString() });
    assert.equal(extended.dueAt.getTime(), newDueAt.getTime());
    const log = await lastAudit({ targetTable: 'loans', targetId: loan.id, action: 'UPDATE' });
    assert.equal(new Date(log.oldValues.dueAt).getTime(), loan.dueAt.getTime());
    assert.equal(log.newValues.event, 'extend');
    assert.equal(new Date(log.newValues.dueAt).getTime(), newDueAt.getTime());
  });

  test('รวมเกิน 24 ชม. = LOAN_DURATION_EXCEEDED (maxDueAt) · ไม่หลังกำหนดเดิม = INVALID_DUE_AT', async () => {
    const { ctx } = await memberCtx();
    const loan = await loans.borrowNow(ctx, { notebookId: (await createNotebook()).id, dueAt: due(2 * HOUR) });
    const maxDueAt = new Date(loan.borrowedAt.getTime() + 24 * HOUR);
    await assert.rejects(
      loans.extend(ctx, loan.id, { newDueAt: new Date(maxDueAt.getTime() + 1000).toISOString() }),
      (e) => e.code === 'LOAN_DURATION_EXCEEDED' && e.details.maxDueAt.getTime() === maxDueAt.getTime() && e.message.includes('24'),
    );
    await assert.rejects(loans.extend(ctx, loan.id, { newDueAt: loan.dueAt.toISOString() }), code('INVALID_DUE_AT'));
    assert.ok(await loans.extend(ctx, loan.id, { newDueAt: maxDueAt.toISOString() })); // พอดี 24 ชม.
  });

  test('ทับการจองต่อจากเรา = EXTEND_CONFLICT_RESERVATION (maxDueAt = startAt) และ actions.maxExtendDueAt ตรงกัน', async () => {
    const { ctx } = await memberCtx();
    const other = await memberCtx();
    const nb = await createNotebook();
    const loan = await loans.borrowNow(ctx, { notebookId: nb.id, dueAt: due(2 * HOUR) });
    const r = await insertReservation(other.user, nb, 4 * HOUR, 6 * HOUR);
    await assert.rejects(
      loans.extend(ctx, loan.id, { newDueAt: due(5 * HOUR) }),
      (e) => e.code === 'EXTEND_CONFLICT_RESERVATION' && e.details.maxDueAt.getTime() === r.startAt.getTime(),
    );
    assert.equal((await loans.getById(ctx, loan.id)).actions.maxExtendDueAt.getTime(), r.startAt.getTime());
    assert.ok(await loans.extend(ctx, loan.id, { newDueAt: r.startAt.toISOString() }));
  });

  test('เกินกำหนดแล้ว / กดคืนแล้ว / ของคนอื่น ต่อเวลาไม่ได้', async () => {
    const { user, ctx } = await memberCtx();
    const other = await memberCtx();
    const overdue = await insertLoan(user, await createNotebook(), -3 * HOUR, -HOUR);
    await assert.rejects(loans.extend(ctx, overdue.id, { newDueAt: due(HOUR) }), code('LOAN_OVERDUE_CANNOT_EXTEND'));
    const pending = await insertLoan(user, await createNotebook(), -HOUR, HOUR);
    await loans.requestReturn(ctx, pending.id);
    await assert.rejects(loans.extend(ctx, pending.id, { newDueAt: due(2 * HOUR) }), code('LOAN_NOT_ACTIVE'));
    await assert.rejects(loans.extend(other.ctx, pending.id, { newDueAt: due(2 * HOUR) }), code('LOAN_NOT_FOUND'));
  });
});

describe('requestReturn / confirmReturn / cancel', () => {
  test('กดคืนก่อนกำหนด isLate=false · หลังกำหนด isLate=true · กดซ้ำ = RETURN_ALREADY_REQUESTED', async () => {
    const { user, ctx } = await memberCtx();
    const onTime = await insertLoan(user, await createNotebook(), -HOUR, HOUR);
    const r1 = await loans.requestReturn(ctx, onTime.id);
    assert.equal(r1.loanStatus, 'return_pending');
    assert.equal(r1.isLate, false);
    assert.equal(r1.actions.canRequestReturn, false);
    await assert.rejects(loans.requestReturn(ctx, onTime.id), code('RETURN_ALREADY_REQUESTED'));

    const lateLoan = await insertLoan(user, await createNotebook(), -3 * HOUR, -HOUR);
    assert.equal((await loans.requestReturn(ctx, lateLoan.id)).isLate, true);
    const other = await memberCtx();
    await assert.rejects(loans.requestReturn(other.ctx, lateLoan.id), code('LOAN_NOT_FOUND'));
  });

  test('แอดมินยืนยันรับคืนสภาพปกติ: returned, เครื่องกลับมาว่าง, ยืนยันซ้ำ = LOAN_ALREADY_RETURNED', async () => {
    const { user, ctx } = await memberCtx();
    const admin = await adminCtx();
    const nb = await createNotebook();
    const loan = await insertLoan(user, nb, -HOUR, HOUR);
    await loans.requestReturn(ctx, loan.id);
    assert.deepEqual((await loans.listPendingReturn(admin.ctx)).rows.filter((l) => l.id === loan.id).length, 1);
    const { loan: done, warnings } = await loans.confirmReturn(admin.ctx, loan.id, { returnCondition: 'normal' });
    assert.equal(done.loanStatus, 'returned');
    assert.equal(done.receivedBy, admin.user.id);
    assert.deepEqual(warnings.affectedReservations, []);
    assert.equal((await notebooks.getById(ctx, nb.id)).currentStatus, 'available');
    await assert.rejects(loans.confirmReturn(admin.ctx, loan.id, { returnCondition: 'normal' }), code('LOAN_ALREADY_RETURNED'));
    await assert.rejects(loans.confirmReturn(ctx, loan.id, { returnCondition: 'normal' }), code('FORBIDDEN'));
  });

  test('สมาชิกลืมกดคืน: แอดมินระบุเวลาเครื่องมาถึงจริง ใช้ตัดสินคืนช้า · เวลาต้องอยู่ระหว่างยืมถึงตอนนี้', async () => {
    const { user } = await memberCtx();
    const admin = await adminCtx();
    const loan = await insertLoan(user, await createNotebook(), -3 * HOUR, -HOUR);
    await assert.rejects(
      loans.confirmReturn(admin.ctx, loan.id, { returnCondition: 'normal', returnRequestedAt: due(-4 * HOUR) }),
      code('VALIDATION_ERROR'),
    );
    const { loan: done } = await loans.confirmReturn(admin.ctx, loan.id, { returnCondition: 'normal', returnRequestedAt: due(-2 * HOUR) });
    assert.equal(done.isLate, false); // มาถึงก่อนกำหนด แม้แอดมินยืนยันหลังกำหนด
    assert.equal(done.returnRequestedAt.getTime(), fromNow(-2 * HOUR).getTime());

    const noTime = await insertLoan(user, await createNotebook(), -3 * HOUR, -HOUR);
    assert.equal((await loans.confirmReturn(admin.ctx, noTime.id, { returnCondition: 'normal' })).loan.isLate, true);
  });

  test('รับคืนแบบเสียหาย: ต้องมีหมายเหตุ, เครื่องเป็น damaged, คืนการจองที่ได้รับผลกระทบ, audit ทั้ง loans และ notebooks', async () => {
    const { user, ctx } = await memberCtx();
    const admin = await adminCtx();
    const nb = await createNotebook();
    const loan = await insertLoan(user, nb, -HOUR, HOUR);
    const future = await insertReservation(user, nb, 30 * HOUR, 31 * HOUR);
    await assert.rejects(loans.confirmReturn(admin.ctx, loan.id, { returnCondition: 'damaged' }), code('VALIDATION_ERROR'));
    const { loan: done, warnings } = await loans.confirmReturn(admin.ctx, loan.id, { returnCondition: 'damaged', returnNote: 'จอแตกมุมขวา' });
    assert.equal(done.returnCondition, 'damaged');
    assert.deepEqual(warnings.affectedReservations.map((r) => r.id), [future.id]);
    const after = await notebooks.getById(admin.ctx, nb.id);
    assert.equal(after.conditionStatus, 'damaged');
    assert.equal(after.conditionNote, 'จอแตกมุมขวา');
    const nbLog = await lastAudit({ targetTable: 'notebooks', targetId: nb.id });
    assert.equal(nbLog.newValues.conditionStatus, 'damaged');
    await assert.rejects(loans.borrowNow(ctx, { notebookId: nb.id, dueAt: due(HOUR) }), code('NOTEBOOK_NOT_AVAILABLE'));
  });

  test('แอดมินยกเลิก: ต้องมีเหตุผล, ผู้ยืมได้แจ้งเตือน loan_cancelled, ยกเลิกซ้ำ = LOAN_CANNOT_CANCEL, ยืนยันรับคืนไม่ได้', async () => {
    const { user } = await memberCtx();
    const admin = await adminCtx();
    const loan = await insertLoan(user, await createNotebook(), -HOUR, HOUR);
    await assert.rejects(loans.cancel(admin.ctx, loan.id, {}), code('VALIDATION_ERROR'));
    const cancelled = await loans.cancel(admin.ctx, loan.id, { reason: 'บันทึกผิดเครื่อง' });
    assert.equal(cancelled.loanStatus, 'cancelled');
    assert.equal(cancelled.cancelReason, 'บันทึกผิดเครื่อง');
    assert.deepEqual((await notifications.listByUser(user.id)).rows.map((n) => n.type), ['loan_cancelled']);
    await assert.rejects(loans.cancel(admin.ctx, loan.id, { reason: 'x' }), code('LOAN_CANNOT_CANCEL'));
    await assert.rejects(loans.cancel(admin.ctx, 999999, { reason: 'x' }), code('LOAN_NOT_FOUND'));
    await assert.rejects(loans.confirmReturn(admin.ctx, loan.id, { returnCondition: 'normal' }), code('LOAN_CANCELLED'));
  });
});

describe('สิทธิ์และการอ่าน', () => {
  test('สมาชิกเรียกฟังก์ชันแอดมิน = FORBIDDEN + audit PERMISSION_DENIED · ดู loan ของคนอื่น = 404', async () => {
    const a = await memberCtx();
    const b = await memberCtx();
    const admin = await adminCtx();
    const loan = await insertLoan(a.user, await createNotebook(), -HOUR, HOUR);
    await assert.rejects(loans.listAll(a.ctx), code('FORBIDDEN'));
    await assert.rejects(loans.cancel(a.ctx, loan.id, { reason: 'x' }), code('FORBIDDEN'));
    assert.equal((await lastAudit({ userId: a.user.id, action: 'PERMISSION_DENIED' })).newValues.permission, 'loan.cancel');
    await assert.rejects(loans.getById(b.ctx, loan.id), code('LOAN_NOT_FOUND'));

    const forAdmin = await loans.getById(admin.ctx, loan.id);
    assert.equal(forAdmin.actions.canExtend, false); // แอดมินไม่ใช่เจ้าของ
    assert.equal((await loans.listAll(admin.ctx, { userId: a.user.id, status: 'borrowing' })).total, 1);
    assert.deepEqual((await loans.listMine(a.ctx)).rows.map((l) => l.id), [loan.id]);
    assert.equal((await loans.listMine(b.ctx)).total, 0);
  });
});
