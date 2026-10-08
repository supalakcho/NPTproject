// การจองล่วงหน้า
import { withTransaction, notebooks, reservations, loans, notifications } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit } from './core/audit.js';
import { requireLogin, requirePermission, hasPermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { reservationDto } from './core/dto.js';
import { getSettings, getSettingIn } from './core/settingsCache.js';
import { assertReservationRange } from './core/reservationRules.js';
import { logger } from './core/logger.js';
import { validate, invalid, paging, compact, id as idRule } from './validators/rules.js';
import { RESERVATION_CREATE, CANCEL_RESERVATION, RESERVATION_LIST_MINE, RESERVATION_LIST_ALL } from './validators/loan.validator.js';

const parseId = (id) => validate({ id }, { id: [idRule] }).id;

async function toDtoPage(result) {
  const { reservationGraceMinutes } = await getSettings();
  return { ...result, rows: result.rows.map((r) => reservationDto(r, reservationGraceMinutes)) };
}

/**
 * จองล่วงหน้า ล็อกเครื่องก่อนตรวจการทับซ้อน
 * @param {import('./core/context.js').Ctx} ctx
 * @param {{ notebookId: number, startAt: string, endAt: string }} input
 */
export async function create(ctx, input) {
  await requirePermission(ctx, PERM.RESERVATION_CREATE);
  const { notebookId, startAt, endAt } = validate(input, RESERVATION_CREATE);
  assertReservationRange(startAt, endAt, await getSettings());

  const created = await withTransaction(async (conn) => {
    const nb = await notebooks.lockById(notebookId, { conn });
    if (!nb || nb.deletedAt) throw new AppError('NOTEBOOK_NOT_FOUND');
    if (nb.conditionStatus !== 'normal') throw new AppError('NOTEBOOK_NOT_AVAILABLE');
    if ((await reservations.findOverlapping(notebookId, startAt, endAt, { conn })).length) throw new AppError('RESERVATION_CONFLICT');
    if ((await loans.findOverlapping(notebookId, startAt, endAt, { conn })).length) throw new AppError('LOAN_CONFLICT');
    const r = await reservations.insert({ userId: ctx.userId, notebookId, startAt, endAt }, { conn });
    await writeAudit(ctx, { action: 'CREATE', targetTable: 'reservations', targetId: r.id, newValues: { notebookId, startAt, endAt } }, { conn });
    return reservationDto(r, await getSettingIn('reservationGraceMinutes', conn));
  });
  logger.info('reservation created', { userId: ctx.userId, reservationId: created.id, notebookId });
  return created;
}

/**
 * ยกเลิกของตัวเอง (reason ไม่บังคับ) หรือแอดมินยกเลิกของคนอื่น (reason บังคับ + แจ้งเตือนเจ้าของ)
 * ไม่ใช่เจ้าของและไม่มีสิทธิ์ = RESERVATION_NOT_FOUND
 */
export async function cancel(ctx, id, input = {}) {
  requireLogin(ctx);
  const reservationId = parseId(id);
  const { reason } = validate(input, CANCEL_RESERVATION);
  const r = await reservations.findById(reservationId);
  if (!r) throw new AppError('RESERVATION_NOT_FOUND');
  const isOwner = r.userId === ctx.userId;
  if (isOwner) {
    await requirePermission(ctx, PERM.RESERVATION_CANCEL_OWN);
  } else {
    if (!hasPermission(ctx, PERM.RESERVATION_CANCEL_ANY)) throw new AppError('RESERVATION_NOT_FOUND');
    if (!reason) throw invalid('reason', 'ต้องระบุเหตุผลเมื่อยกเลิกการจองของผู้อื่น');
  }
  if (!['upcoming', 'active'].includes(r.status)) throw new AppError('RESERVATION_CANNOT_CANCEL');

  return withTransaction(async (conn) => {
    const cancelled = await reservations.cancel(reservationId, { cancelledBy: ctx.userId, reason }, { conn });
    if (!cancelled) throw new AppError('RESERVATION_CANNOT_CANCEL');
    if (!isOwner) await notifications.insertIfNotExists({ type: 'reservation_cancelled', reservationId }, { conn });
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'reservations', targetId: reservationId, newValues: { event: 'cancel', reason } }, { conn });
    return reservationDto(cancelled, await getSettingIn('reservationGraceMinutes', conn));
  });
}

/** ประวัติการจองของฉัน */
export async function listMine(ctx, filter = {}) {
  requireLogin(ctx);
  return toDtoPage(await reservations.listByUser(ctx.userId, compact(paging(validate(filter, RESERVATION_LIST_MINE)))));
}

/** เจ้าของ หรือผู้ที่มี reservation.view_all */
export async function getById(ctx, id) {
  requireLogin(ctx);
  const r = await reservations.findById(parseId(id));
  if (!r || (r.userId !== ctx.userId && !hasPermission(ctx, PERM.RESERVATION_VIEW_ALL))) throw new AppError('RESERVATION_NOT_FOUND');
  const { reservationGraceMinutes } = await getSettings();
  return reservationDto(r, reservationGraceMinutes);
}

export async function listAll(ctx, filter = {}) {
  await requirePermission(ctx, PERM.RESERVATION_VIEW_ALL);
  return toDtoPage(await reservations.list(compact(paging(validate(filter, RESERVATION_LIST_ALL)))));
}
