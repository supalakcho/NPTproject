// รุ่นและสเปกโน๊ตบุ๊ค
import { withTransaction, brands, notebookModels } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit, diff } from './core/audit.js';
import { requirePermission, hasPermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { modelDto } from './core/dto.js';
import { validate, invalid, paging, compact, id as idRule } from './validators/rules.js';
import { MODEL_CREATE, MODEL_UPDATE, MODEL_LIST } from './validators/catalog.validator.js';

const FIELDS = ['brandId', 'modelName', 'cpu', 'ramGb', 'storageGb', 'screenInch', 'os', 'imagePath'];
const parseId = (id) => validate({ id }, { id: [idRule] }).id;

/** includeDeleted ใช้ได้เฉพาะผู้ที่จัดการรุ่นได้ */
export async function listModels(ctx, filter = {}) {
  await requirePermission(ctx, PERM.NOTEBOOK_VIEW);
  const { includeDeleted, ...rest } = paging(validate(filter, MODEL_LIST));
  const result = await notebookModels.list(compact(rest), {
    includeDeleted: Boolean(includeDeleted) && hasPermission(ctx, PERM.MODEL_MANAGE),
  });
  return { ...result, rows: result.rows.map(modelDto) };
}

export async function getById(ctx, id) {
  await requirePermission(ctx, PERM.NOTEBOOK_VIEW);
  const model = await notebookModels.findById(parseId(id));
  if (!model) throw new AppError('MODEL_NOT_FOUND');
  return modelDto(model);
}

async function ensureBrand(brandId, conn) {
  if (!(await brands.findById(brandId, { conn }))) throw new AppError('BRAND_NOT_FOUND');
}

async function ensureUniqueName(brandId, modelName, excludeId, conn) {
  const dup = await notebookModels.findByBrandAndName(brandId, modelName, { conn, includeDeleted: true });
  if (dup && dup.id !== excludeId) throw new AppError('MODEL_NAME_TAKEN');
}

/** @param {import('./core/context.js').Ctx} ctx @param {object} input ดู MODEL_CREATE */
export async function createModel(ctx, input) {
  await requirePermission(ctx, PERM.MODEL_MANAGE);
  const data = compact(validate(input, MODEL_CREATE));
  return withTransaction(async (conn) => {
    await ensureBrand(data.brandId, conn);
    await ensureUniqueName(data.brandId, data.modelName, undefined, conn);
    const model = await notebookModels.insert(data, { conn });
    await writeAudit(ctx, { action: 'CREATE', targetTable: 'notebook_models', targetId: model.id, newValues: data }, { conn });
    return modelDto(model);
  });
}

/** ส่งเฉพาะ field ที่แก้ ตรวจชื่อซ้ำเมื่อแก้ brandId หรือ modelName */
export async function updateModel(ctx, id, input) {
  await requirePermission(ctx, PERM.MODEL_MANAGE);
  const modelId = parseId(id);
  const data = validate(input, MODEL_UPDATE);
  for (const field of FIELDS.filter((f) => f !== 'imagePath')) {
    if (data[field] === null) throw invalid(field, 'ต้องระบุ');
  }
  return withTransaction(async (conn) => {
    const before = await notebookModels.findById(modelId, { conn });
    if (!before) throw new AppError('MODEL_NOT_FOUND');
    if (data.brandId !== undefined) await ensureBrand(data.brandId, conn);
    if (data.brandId !== undefined || data.modelName !== undefined) {
      await ensureUniqueName(data.brandId ?? before.brandId, data.modelName ?? before.modelName, modelId, conn);
    }
    const after = await notebookModels.update(modelId, data, { conn });
    const changes = diff(before, after, FIELDS);
    if (Object.keys(changes.newValues).length) {
      await writeAudit(ctx, { action: 'UPDATE', targetTable: 'notebook_models', targetId: modelId, ...changes }, { conn });
    }
    return modelDto(after);
  });
}

/** ลบไม่ได้ถ้ายังมีเครื่องที่ใช้รุ่นนี้ */
export async function deleteModel(ctx, id) {
  await requirePermission(ctx, PERM.MODEL_MANAGE);
  const modelId = parseId(id);
  return withTransaction(async (conn) => {
    const model = await notebookModels.findById(modelId, { conn });
    if (!model) throw new AppError('MODEL_NOT_FOUND');
    const activeNotebooks = await notebookModels.countActiveNotebooks(modelId, { conn });
    if (activeNotebooks > 0) throw new AppError('MODEL_IN_USE', { details: { activeNotebooks } });
    await notebookModels.softDelete(modelId, { conn });
    await writeAudit(ctx, { action: 'DELETE', targetTable: 'notebook_models', targetId: modelId, oldValues: { modelName: model.modelName } }, { conn });
    return null;
  });
}

/** ยี่ห้อของรุ่นต้องไม่ถูกลบ */
export async function restoreModel(ctx, id) {
  await requirePermission(ctx, PERM.MODEL_MANAGE);
  const modelId = parseId(id);
  return withTransaction(async (conn) => {
    const model = await notebookModels.findById(modelId, { conn, includeDeleted: true });
    if (!model || !model.deletedAt) throw new AppError('MODEL_NOT_FOUND');
    await ensureBrand(model.brandId, conn);
    await notebookModels.restore(modelId, { conn });
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'notebook_models', targetId: modelId, newValues: { event: 'restore' } }, { conn });
    return modelDto(await notebookModels.findById(modelId, { conn }));
  });
}
