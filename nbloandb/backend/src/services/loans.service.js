// การยืม-คืน: ยืมทันที, รับเครื่องจากการจอง, ต่อเวลา, กดคืน, ยืนยันรับคืน, ยกเลิก
// งานที่เปลี่ยนสถานะเครื่องล็อกแถวเครื่อง (notebooks.lockById) ก่อนอ่านข้อมูลการยืม/การจองทุกครั้ง
import { withTransaction, notebooks, loans, reservations, notifications } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit } from './core/audit.js';
import { requireLogin, requirePermission, hasPermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { loanDto } from './core/dto.js';
import { getSettings, getSettingIn } from './core/settingsCache.js';
import { futureReservations } from './core/reservationRules.js';
import { now } from './core/clock.js';
import { logger } from './core/logger.js';
import { validate, invalid, paging, compact, id as idRule } from './validators/rules.js';
import { BORROW, EXTEND, CONFIRM_RETURN, CANCEL_LOAN, LOAN_LIST_MINE, LOAN_LIST_ALL } from './validators/loan.validator.js';

const HOUR = 3_600_000;
const parseId = (id) => validate({ id }, { id: [idRule] }).id;
const toPage = (result) => ({ ...result, rows: result.rows.map((l) => loanDto(l)) });

/**
 * ปุ่มใน UI: maxExtendDueAt = min(borrowedAt + maxLoanHours, startAt ของการจองถัดไปที่ทับ)
 * @param {import('./core/context.js').Ctx} ctx
 * @param {object} loan
 * @param {import('mysql2/promise').PoolConnection} [conn]
 */
async function actionsFor(ctx, loan, conn) {
  const isOwner = loan.userId === ctx.userId;
  const maxLoanHours = conn ? await getSettingIn('maxLoanHours', conn) : (await getSettings()).maxLoanHours;
  let maxExtendDueAt = new Date(loan.borrowedAt.getTime() + maxLoanHours * HOUR);
  if (loan.loanStatus === 'borrowing') {
    const [next] = await reservations.findOverlapping(loan.notebookId, loan.dueAt, maxExtendDueAt, { conn });
    if (next && next.startAt < maxExtendDueAt) maxExtendDueAt = next.startAt;
  }
  return {
    canExtend: isOwner && loan.loanStatus === 'borrowing' && maxExtendDueAt > loan.dueAt && hasPermission(ctx, PERM.LOAN_EXTEND),
    maxExtendDueAt,
    canRequestReturn: isOwner && ['borrowing', 'overdue'].includes(loan.loanStatus) && hasPermission(ctx, PERM.LOAN_RETURN_REQUEST),
  };
}

const withActions = async (ctx, loan, conn) => loanDto(loan, await actionsFor(ctx, loan, conn));

async function assertUnderLimit(userId, conn) {
  const max = await getSettingIn('maxActiveLoansPerUser', conn);
  if ((await loans.countActiveByUser(userId, { conn })) >= max) throw new AppError('LOAN_LIMIT_REACHED');
}

/**
 * สมาชิกยืมทันที (ส่ง notebookId หรือ assetCode อย่างใดอย่างหนึ่ง)
 * @param {import('./core/context.js').Ctx} ctx
 * @param {{ notebookId?: number, assetCode?: string, dueAt: string }} input
 */
export async function borrowNow(ctx, input) {
  await requirePermission(ctx, PERM.LOAN_CREATE);
  const data = validate(input, BORROW);
  if (!data.notebookId && !data.assetCode) throw invalid('notebookId', 'ต้องระบุ notebookId หรือ assetCode');
  let notebookId = data.notebookId;
  if (!notebookId) {
    const nb = await notebooks.findByAssetCode(data.assetCode);
    if (!nb) throw new AppError('NOTEBOOK_NOT_FOUND');
    notebookId = nb.id;
  }
  const { dueAt } = data;

  const loan = await withTransaction(async (conn) => {
    const nb = await notebooks.lockById(notebookId, { conn });
    if (!nb || nb.deletedAt) throw new AppError('NOTEBOOK_NOT_FOUND');
    if (nb.conditionStatus !== 'normal') throw new AppError('NOTEBOOK_NOT_AVAILABLE');

    const t = now();
    const maxLoanHours = await getSettingIn('maxLoanHours', conn);
    if (dueAt <= t || dueAt - t > maxLoanHours * HOUR) {
      throw new AppError('INVALID_DUE_AT', { details: { maxDueAt: new Date(t.getTime() + maxLoanHours * HOUR) } });
    }
    if (await loans.findActiveByNotebook(notebookId, { conn })) throw new AppError('NOTEBOOK_ALREADY_BORROWED');
    await assertUnderLimit(ctx.userId, conn);

    const overlaps = await reservations.findOverlapping(notebookId, t, dueAt, { conn });
    const others = overlaps.filter((r) => r.userId !== ctx.userId);
    if (others.length) throw new AppError('RESERVATION_CONFLICT', { details: { availableUntil: others[0].startAt } });
    if (overlaps.length) throw new AppError('OWN_RESERVATION_OVERLAP', { details: { reservationId: overlaps[0].id } });

    const created = await loans.insert({ userId: ctx.userId, notebookId, borrowedAt: t, dueAt }, { conn });
    await writeAudit(ctx, { action: 'CREATE', targetTable: 'loans', targetId: created.id, newValues: { event: 'borrow', notebookId, borrowedAt: t, dueAt } }, { conn });
    return withActions(ctx, created, conn);
  });
  logger.info('loan borrowed', { userId: ctx.userId, loanId: loan.id, notebookId });
  return loan;
}

/**
 * รับเครื่องตามที่จอง: การจองกลายเป็นการยืม dueAt = endAt ของการจอง
 * @param {import('./core/context.js').Ctx} ctx
 * @param {number} reservationId
 */
export async function pickupReservation(ctx, reservationId) {
  await requirePermission(ctx, PERM.LOAN_CREATE);
  const id = parseId(reservationId);
  const first = await reservations.findById(id);
  if (!first || first.userId !== ctx.userId) throw new AppError('RESERVATION_NOT_FOUND');

  const loan = await withTransaction(async (conn) => {
    const nb = await notebooks.lockById(first.notebookId, { conn });
    const r = await reservations.findById(id, { conn }); // สถานะล่าสุดหลังล็อก
    const statusError = {
      upcoming: 'RESERVATION_NOT_STARTED',
      expired: 'RESERVATION_EXPIRED',
      cancelled: 'RESERVATION_CANCELLED',
      fulfilled: 'RESERVATION_ALREADY_PICKED_UP',
    }[r.status];
    if (statusError) throw new AppError(statusError);
    const t = now();
    if (r.endAt <= t) throw new AppError('RESERVATION_EXPIRED');
    if (!nb || nb.deletedAt || nb.conditionStatus !== 'normal') throw new AppError('NOTEBOOK_NOT_AVAILABLE');
    if (await loans.findActiveByNotebook(r.notebookId, { conn })) throw new AppError('NOTEBOOK_NOT_RETURNED_YET');
    await assertUnderLimit(ctx.userId, conn);

    const created = await loans.insert(
      { userId: ctx.userId, notebookId: r.notebookId, borrowedAt: t, dueAt: r.endAt, reservationId: id },
      { conn },
    );
    await writeAudit(ctx, { action: 'CREATE', targetTable: 'loans', targetId: created.id, newValues: { event: 'pickup', reservationId: id, dueAt: r.endAt } }, { conn });
    return withActions(ctx, created, conn);
  });
  logger.info('reservation picked up', { userId: ctx.userId, loanId: loan.id, reservationId: id });
  return loan;
}

/**
 * ต่อเวลาเอง ไม่ต้องรออนุมัติ · job จะสร้างแจ้งเตือน "ใกล้ครบกำหนด" ของ dueAt ใหม่ให้เอง
 * @param {import('./core/context.js').Ctx} ctx
 * @param {number} loanId
 * @param {{ newDueAt: string }} input
 */
export async function extend(ctx, loanId, input) {
  await requirePermission(ctx, PERM.LOAN_EXTEND);
  const id = parseId(loanId);
  const { newDueAt } = validate(input, EXTEND);
  const first = await loans.findById(id);
  if (!first || first.userId !== ctx.userId) throw new AppError('LOAN_NOT_FOUND');

  const loan = await withTransaction(async (conn) => {
    await notebooks.lockById(first.notebookId, { conn });
    const current = await loans.findById(id, { conn });
    if (current.loanStatus === 'overdue') throw new AppError('LOAN_OVERDUE_CANNOT_EXTEND');
    if (current.loanStatus !== 'borrowing') throw new AppError('LOAN_NOT_ACTIVE');
    if (newDueAt <= current.dueAt) throw new AppError('INVALID_DUE_AT', { details: { reason: 'ต้องหลังกำหนดคืนเดิม' } });

    const maxLoanHours = await getSettingIn('maxLoanHours', conn);
    const maxDueAt = new Date(current.borrowedAt.getTime() + maxLoanHours * HOUR);
    if (newDueAt > maxDueAt) throw new AppError('LOAN_DURATION_EXCEEDED', { params: { n: maxLoanHours }, details: { maxDueAt } });
    const [next] = await reservations.findOverlapping(current.notebookId, current.dueAt, newDueAt, { conn });
    if (next) throw new AppError('EXTEND_CONFLICT_RESERVATION', { details: { maxDueAt: next.startAt } });

    const updated = await loans.extendDueAt(id, newDueAt, { conn });
    if (!updated) throw new AppError('LOAN_STATE_CHANGED');
    await writeAudit(
      ctx,
      { action: 'UPDATE', targetTable: 'loans', targetId: id, oldValues: { dueAt: current.dueAt }, newValues: { event: 'extend', dueAt: newDueAt } },
      { conn },
    );
    return withActions(ctx, updated, conn);
  });
  logger.info('loan extended', { userId: ctx.userId, loanId: id, newDueAt });
  return loan;
}

/** สมาชิกกดคืน · isLate ตัดสินจากเวลากดคืน */
export async function requestReturn(ctx, loanId) {
  await requirePermission(ctx, PERM.LOAN_RETURN_REQUEST);
  const id = parseId(loanId);
  const loan = await withTransaction(async (conn) => {
    const current = await loans.findById(id, { conn });
    if (!current || current.userId !== ctx.userId) throw new AppError('LOAN_NOT_FOUND');
    if (current.loanStatus === 'return_pending') throw new AppError('RETURN_ALREADY_REQUESTED');
    if (!['borrowing', 'overdue'].includes(current.loanStatus)) throw new AppError('LOAN_NOT_ACTIVE');
    const t = now();
    const updated = await loans.requestReturn(id, { at: t }, { conn });
    if (!updated) throw new AppError('LOAN_STATE_CHANGED');
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'loans', targetId: id, newValues: { event: 'request_return', returnRequestedAt: t } }, { conn });
    return withActions(ctx, updated, conn);
  });
  logger.info('loan return requested', { userId: ctx.userId, loanId: id, isLate: loan.isLate });
  return loan;
}

/**
 * แอดมินยืนยันรับเครื่อง · สมาชิกลืมกดคืน: ใช้ returnRequestedAt ที่ระบุ (ระหว่าง borrowedAt ถึงตอนนี้) หรือเวลาปัจจุบัน
 * รับคืนแบบ damaged → เครื่องเปลี่ยนสภาพเป็น damaged และคืนการจองในอนาคตที่ได้รับผลกระทบ
 * @returns {Promise<{ loan: object, warnings: { affectedReservations: object[] } }>}
 */
export async function confirmReturn(ctx, loanId, input) {
  await requirePermission(ctx, PERM.LOAN_RECEIVE);
  const id = parseId(loanId);
  const { returnCondition, returnNote, returnRequestedAt } = validate(input, CONFIRM_RETURN);
  if (returnCondition === 'damaged' && !returnNote) throw invalid('returnNote', 'ต้องระบุหมายเหตุเมื่อเครื่องเสียหาย');

  const result = await withTransaction(async (conn) => {
    const first = await loans.findById(id, { conn });
    if (!first) throw new AppError('LOAN_NOT_FOUND');
    await notebooks.lockById(first.notebookId, { conn });
    const current = await loans.findById(id, { conn });
    if (current.loanStatus === 'returned') throw new AppError('LOAN_ALREADY_RETURNED');
    if (current.loanStatus === 'cancelled') throw new AppError('LOAN_CANCELLED');

    const t = now();
    if (!current.returnRequestedAt) {
      const at = returnRequestedAt ?? t;
      if (at < current.borrowedAt || at > t) throw invalid('returnRequestedAt', 'ต้องอยู่ระหว่างเวลายืมถึงเวลาปัจจุบัน');
      if (!(await loans.requestReturn(id, { at }, { conn }))) throw new AppError('LOAN_STATE_CHANGED');
    }
    const loan = await loans.confirmReturn(id, { receivedBy: ctx.userId, returnCondition, returnNote: returnNote ?? null, at: t }, { conn });
    if (!loan) throw new AppError('LOAN_STATE_CHANGED');
    await writeAudit(
      ctx,
      { action: 'UPDATE', targetTable: 'loans', targetId: id, newValues: { event: 'confirm_return', returnCondition, returnNote, returnedAt: t } },
      { conn },
    );

    let affectedReservations = [];
    if (returnCondition === 'damaged') {
      const nb = await notebooks.findById(loan.notebookId, { conn });
      await notebooks.updateCondition(loan.notebookId, 'damaged', returnNote, { conn });
      await writeAudit(
        ctx,
        {
          action: 'UPDATE', targetTable: 'notebooks', targetId: loan.notebookId,
          oldValues: { conditionStatus: nb?.conditionStatus, conditionNote: nb?.conditionNote },
          newValues: { event: 'return_damaged', conditionStatus: 'damaged', conditionNote: returnNote },
        },
        { conn },
      );
      affectedReservations = await futureReservations(loan.notebookId, await getSettingIn('reservationMaxDaysAhead', conn), conn);
    }
    return { loan: loanDto(loan), warnings: { affectedReservations } };
  });
  logger.info('loan return confirmed', { adminId: ctx.userId, loanId: id, returnCondition });
  return result;
}

/** แอดมินยกเลิก ผู้ยืมได้แจ้งเตือน loan_cancelled */
export async function cancel(ctx, loanId, input) {
  await requirePermission(ctx, PERM.LOAN_CANCEL);
  const id = parseId(loanId);
  const { reason } = validate(input, CANCEL_LOAN);
  return withTransaction(async (conn) => {
    const cancelled = await loans.cancel(id, { cancelledBy: ctx.userId, reason }, { conn });
    if (!cancelled) throw new AppError((await loans.findById(id, { conn })) ? 'LOAN_CANNOT_CANCEL' : 'LOAN_NOT_FOUND');
    await notifications.insertIfNotExists({ type: 'loan_cancelled', loanId: id }, { conn });
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'loans', targetId: id, newValues: { event: 'cancel', reason } }, { conn });
    return loanDto(cancelled);
  });
}

/** ประวัติการยืมของฉัน */
export async function listMine(ctx, filter = {}) {
  requireLogin(ctx);
  return toPage(await loans.listByUser(ctx.userId, compact(paging(validate(filter, LOAN_LIST_MINE)))));
}

/** เจ้าของ หรือผู้ที่มี loan.view_all · มี actions ให้ frontend เปิด/ปิดปุ่ม */
export async function getById(ctx, loanId) {
  requireLogin(ctx);
  const loan = await loans.findById(parseId(loanId));
  if (!loan || (loan.userId !== ctx.userId && !hasPermission(ctx, PERM.LOAN_VIEW_ALL))) throw new AppError('LOAN_NOT_FOUND');
  return withActions(ctx, loan);
}

export async function listAll(ctx, filter = {}) {
  await requirePermission(ctx, PERM.LOAN_VIEW_ALL);
  return toPage(await loans.list(compact(paging(validate(filter, LOAN_LIST_ALL)))));
}

export async function listPendingReturn(ctx, filter = {}) {
  await requirePermission(ctx, PERM.LOAN_RECEIVE);
  const { page, pageSize } = paging(validate(filter, LOAN_LIST_MINE));
  return toPage(await loans.listPendingReturn({ page, pageSize }));
}
