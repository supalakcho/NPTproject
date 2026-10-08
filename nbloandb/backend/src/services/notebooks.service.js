// โน๊ตบุ๊คแต่ละเครื่อง · สมาชิกไม่เห็นข้อมูลภายใน (serial, สภาพ) ตาม DTO
import { withTransaction, notebooks, notebookModels, loans } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit, diff } from './core/audit.js';
import { requirePermission, hasPermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { notebookDto, loanDto, reservationDto } from './core/dto.js';
import { getSettings, getSettingIn } from './core/settingsCache.js';
import { assertReservationRange, futureReservations } from './core/reservationRules.js';
import { now } from './core/clock.js';
import { validate, invalid, paging, compact, str, upper, id as idRule } from './validators/rules.js';
import { NOTEBOOK_CREATE, NOTEBOOK_UPDATE, NOTEBOOK_LIST, NOTEBOOK_LIST_ADMIN } from './validators/catalog.validator.js';
import { TIME_RANGE } from './validators/loan.validator.js';

const FIELDS = ['modelId', 'assetCode', 'serialNumber', 'conditionStatus', 'conditionNote', 'purchasedAt'];
const parseId = (id) => validate({ id }, { id: [idRule] }).id;
const isInternal = (ctx) => hasPermission(ctx, PERM.NOTEBOOK_UPDATE);

/** สมาชิกกรองได้ keyword, brandId, modelId, currentStatus · แอดมินได้เพิ่ม conditionStatus, includeDeleted */
export async function list(ctx, filter = {}) {
  await requirePermission(ctx, PERM.NOTEBOOK_VIEW);
  const internal = isInternal(ctx);
  const { includeDeleted, ...rest } = paging(validate(filter, internal ? NOTEBOOK_LIST_ADMIN : NOTEBOOK_LIST));
  const result = await notebooks.list(compact(rest), { includeDeleted: Boolean(includeDeleted) });
  return { ...result, rows: result.rows.map((nb) => notebookDto(nb, { internal })) };
}

async function detail(ctx, nb) {
  if (!isInternal(ctx)) return notebookDto(nb);
  const { reservationGraceMinutes, reservationMaxDaysAhead } = await getSettings();
  const active = await loans.findActiveByNotebook(nb.id);
  const upcoming = await futureReservations(nb.id, reservationMaxDaysAhead);
  return {
    ...notebookDto(nb, { internal: true }),
    activeLoan: active ? loanDto(active) : null,
    upcomingReservations: upcoming.map((r) => reservationDto(r, reservationGraceMinutes)),
  };
}

export async function getById(ctx, id) {
  await requirePermission(ctx, PERM.NOTEBOOK_VIEW);
  const nb = await notebooks.findById(parseId(id));
  if (!nb) throw new AppError('NOTEBOOK_NOT_FOUND');
  return detail(ctx, nb);
}

/** สแกน barcode (trim + ตัวพิมพ์ใหญ่) */
export async function getByAssetCode(ctx, assetCode) {
  await requirePermission(ctx, PERM.NOTEBOOK_VIEW);
  const code = validate({ assetCode }, { assetCode: [str({ max: 50 }), upper] }).assetCode;
  const nb = await notebooks.findByAssetCode(code);
  if (!nb) throw new AppError('NOTEBOOK_NOT_FOUND');
  return detail(ctx, nb);
}

/** หาเครื่องว่างสำหรับจอง ตรวจช่วงเวลาเหมือนการจอง */
export async function searchAvailable(ctx, input) {
  await requirePermission(ctx, PERM.NOTEBOOK_VIEW);
  const { startAt, endAt, modelId } = validate(input, TIME_RANGE);
  assertReservationRange(startAt, endAt, await getSettings());
  const rows = await notebooks.findAvailableInRange(startAt, endAt, compact({ modelId }));
  return rows.map((nb) => notebookDto(nb, { internal: isInternal(ctx) }));
}

async function ensureUnique(data, excludeId, conn) {
  if (data.assetCode !== undefined) {
    const dup = await notebooks.findByAssetCode(data.assetCode, { conn, includeDeleted: true });
    if (dup && dup.id !== excludeId) throw new AppError('ASSET_CODE_TAKEN');
  }
  if (data.serialNumber !== undefined) {
    const dup = await notebooks.findBySerialNumber(data.serialNumber, { conn, includeDeleted: true });
    if (dup && dup.id !== excludeId) throw new AppError('SERIAL_NUMBER_TAKEN');
  }
}

function assertPurchasedAt(purchasedAt) {
  if (purchasedAt && purchasedAt > now()) throw invalid('purchasedAt', 'วันที่ซื้อต้องไม่เกินวันนี้');
}

export async function create(ctx, input) {
  await requirePermission(ctx, PERM.NOTEBOOK_CREATE);
  const data = compact(validate(input, NOTEBOOK_CREATE));
  assertPurchasedAt(data.purchasedAt);
  return withTransaction(async (conn) => {
    if (!(await notebookModels.findById(data.modelId, { conn }))) throw new AppError('MODEL_NOT_FOUND');
    await ensureUnique(data, undefined, conn);
    const nb = await notebooks.insert(data, { conn });
    await writeAudit(ctx, { action: 'CREATE', targetTable: 'notebooks', targetId: nb.id, newValues: data }, { conn });
    return notebookDto(nb, { internal: true });
  });
}

/**
 * เปลี่ยนเป็น retired ขณะมีการยืม/จองค้าง → NOTEBOOK_HAS_COMMITMENTS
 * เปลี่ยนเป็น damaged/maintenance แล้วมีการจองในอนาคต → คืนใน warnings.affectedReservations
 * @returns {Promise<{ notebook: object, warnings: { affectedReservations: object[] } }>}
 */
export async function update(ctx, id, input) {
  await requirePermission(ctx, PERM.NOTEBOOK_UPDATE);
  const notebookId = parseId(id);
  const data = validate(input, NOTEBOOK_UPDATE);
  for (const field of ['modelId', 'assetCode', 'serialNumber', 'conditionStatus']) {
    if (data[field] === null) throw invalid(field, 'ต้องระบุ');
  }
  assertPurchasedAt(data.purchasedAt);

  return withTransaction(async (conn) => {
    if (!(await notebooks.lockById(notebookId, { conn }))) throw new AppError('NOTEBOOK_NOT_FOUND');
    const before = await notebooks.findById(notebookId, { conn });
    if (!before) throw new AppError('NOTEBOOK_NOT_FOUND');
    if (data.modelId !== undefined && !(await notebookModels.findById(data.modelId, { conn }))) {
      throw new AppError('MODEL_NOT_FOUND');
    }
    await ensureUnique(data, notebookId, conn);

    let affectedReservations = [];
    const status = data.conditionStatus;
    if (status && status !== before.conditionStatus) {
      if (status === 'retired') {
        const counts = await notebooks.countOpenCommitments(notebookId, { conn });
        if (counts.activeLoans || counts.upcomingReservations) throw new AppError('NOTEBOOK_HAS_COMMITMENTS', { details: counts });
      } else if (status !== 'normal') {
        affectedReservations = await futureReservations(notebookId, await getSettingIn('reservationMaxDaysAhead', conn), conn);
      }
    }

    const after = await notebooks.update(notebookId, data, { conn });
    const changes = diff(before, after, FIELDS);
    if (Object.keys(changes.newValues).length) {
      await writeAudit(ctx, { action: 'UPDATE', targetTable: 'notebooks', targetId: notebookId, ...changes }, { conn });
    }
    return { notebook: notebookDto(after, { internal: true }), warnings: { affectedReservations } };
  });
}

/** ลบไม่ได้ถ้ามีการยืมหรือการจองค้าง */
export async function remove(ctx, id) {
  await requirePermission(ctx, PERM.NOTEBOOK_DELETE);
  const notebookId = parseId(id);
  return withTransaction(async (conn) => {
    const locked = await notebooks.lockById(notebookId, { conn });
    if (!locked || locked.deletedAt) throw new AppError('NOTEBOOK_NOT_FOUND');
    const counts = await notebooks.countOpenCommitments(notebookId, { conn });
    if (counts.activeLoans || counts.upcomingReservations) throw new AppError('NOTEBOOK_HAS_COMMITMENTS', { details: counts });
    await notebooks.softDelete(notebookId, { conn });
    await writeAudit(ctx, { action: 'DELETE', targetTable: 'notebooks', targetId: notebookId }, { conn });
    return null;
  });
}
export { remove as delete };

export async function restore(ctx, id) {
  await requirePermission(ctx, PERM.NOTEBOOK_DELETE);
  const notebookId = parseId(id);
  return withTransaction(async (conn) => {
    if (!(await notebooks.restore(notebookId, { conn }))) throw new AppError('NOTEBOOK_NOT_FOUND');
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'notebooks', targetId: notebookId, newValues: { event: 'restore' } }, { conn });
    return notebookDto(await notebooks.findById(notebookId, { conn }), { internal: true });
  });
}
