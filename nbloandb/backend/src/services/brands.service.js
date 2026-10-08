// ยี่ห้อโน๊ตบุ๊ค
import { withTransaction, brands } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { writeAudit, diff } from './core/audit.js';
import { requirePermission } from './core/authorize.js';
import { PERM } from './core/permissionCodes.js';
import { brandDto } from './core/dto.js';
import { validate, paging, compact, id as idRule } from './validators/rules.js';
import { BRAND, BRAND_LIST } from './validators/catalog.validator.js';

const parseId = (id) => validate({ id }, { id: [idRule] }).id;

/** dropdown: [{ id, name }] เรียงตามชื่อ */
export async function listBrandOptions(ctx) {
  await requirePermission(ctx, PERM.NOTEBOOK_VIEW);
  return (await brands.findAll()).map(({ id, name }) => ({ id, name }));
}

/** @param {import('./core/context.js').Ctx} ctx @param {object} filter */
export async function listBrands(ctx, filter = {}) {
  await requirePermission(ctx, PERM.BRAND_MANAGE);
  const { includeDeleted, ...rest } = paging(validate(filter, BRAND_LIST));
  const result = await brands.list(compact(rest), { includeDeleted: Boolean(includeDeleted) });
  return { ...result, rows: result.rows.map(brandDto) };
}

/** @param {import('./core/context.js').Ctx} ctx @param {{ name: string }} input */
export async function createBrand(ctx, input) {
  await requirePermission(ctx, PERM.BRAND_MANAGE);
  const { name } = validate(input, BRAND);
  if (await brands.findByName(name, { includeDeleted: true })) throw new AppError('BRAND_NAME_TAKEN');
  return withTransaction(async (conn) => {
    const brand = await brands.insert({ name }, { conn });
    await writeAudit(ctx, { action: 'CREATE', targetTable: 'brands', targetId: brand.id, newValues: { name } }, { conn });
    return brandDto(brand);
  });
}

/** @param {import('./core/context.js').Ctx} ctx @param {number} id @param {{ name: string }} input */
export async function updateBrand(ctx, id, input) {
  await requirePermission(ctx, PERM.BRAND_MANAGE);
  const brandId = parseId(id);
  const { name } = validate(input, BRAND);
  return withTransaction(async (conn) => {
    const before = await brands.findById(brandId, { conn });
    if (!before) throw new AppError('BRAND_NOT_FOUND');
    const dup = await brands.findByName(name, { conn, includeDeleted: true });
    if (dup && dup.id !== brandId) throw new AppError('BRAND_NAME_TAKEN');
    const after = await brands.update(brandId, { name }, { conn });
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'brands', targetId: brandId, ...diff(before, after, ['name']) }, { conn });
    return brandDto(after);
  });
}

/** ลบไม่ได้ถ้ายังมีรุ่นที่ใช้ยี่ห้อนี้ */
export async function deleteBrand(ctx, id) {
  await requirePermission(ctx, PERM.BRAND_MANAGE);
  const brandId = parseId(id);
  return withTransaction(async (conn) => {
    const brand = await brands.findById(brandId, { conn });
    if (!brand) throw new AppError('BRAND_NOT_FOUND');
    const activeModels = await brands.countActiveModels(brandId, { conn });
    if (activeModels > 0) throw new AppError('BRAND_IN_USE', { details: { activeModels } });
    await brands.softDelete(brandId, { conn });
    await writeAudit(ctx, { action: 'DELETE', targetTable: 'brands', targetId: brandId, oldValues: { name: brand.name } }, { conn });
    return null;
  });
}

/** กู้คืน audit เป็น UPDATE + event 'restore' (ENUM ไม่มี RESTORE) */
export async function restoreBrand(ctx, id) {
  await requirePermission(ctx, PERM.BRAND_MANAGE);
  const brandId = parseId(id);
  return withTransaction(async (conn) => {
    if (!(await brands.restore(brandId, { conn }))) throw new AppError('BRAND_NOT_FOUND');
    await writeAudit(ctx, { action: 'UPDATE', targetTable: 'brands', targetId: brandId, newValues: { event: 'restore' } }, { conn });
    return brandDto(await brands.findById(brandId, { conn }));
  });
}
