// แปลง error ใดๆ เป็น AppError: DbError ตามชื่อ constraint (ตรงกับ notebook_loan.sql) · error อื่น = INTERNAL_ERROR
import { DbError } from '../../models/index.js';
import { AppError } from './AppError.js';
import { logger } from './logger.js';

const DUPLICATE_BY_CONSTRAINT = {
  uq_users_email: 'EMAIL_TAKEN',
  uq_users_member_code: 'MEMBER_CODE_TAKEN',
  uq_brands_name: 'BRAND_NAME_TAKEN',
  uq_models_brand_name: 'MODEL_NAME_TAKEN',
  uq_notebooks_asset_code: 'ASSET_CODE_TAKEN',
  uq_notebooks_serial: 'SERIAL_NUMBER_TAKEN',
  uq_loans_active_notebook: 'NOTEBOOK_ALREADY_BORROWED',
  uq_loans_reservation: 'RESERVATION_ALREADY_PICKED_UP',
};

const CHECK_BY_PREFIX = [
  ['chk_loans_due', 'LOAN_DURATION_EXCEEDED'],
  ['chk_res_', 'INVALID_TIME_RANGE'],
];

/**
 * @param {unknown} err
 * @returns {AppError}
 * @example
 * try { ... } catch (err) { throw toAppError(err); }
 */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof DbError) {
    const mapped = mapDbError(err);
    if (mapped) return new AppError(mapped);
  }
  logger.error('unexpected error', err);
  return new AppError('INTERNAL_ERROR');
}

function mapDbError(err) {
  if (err.code === 'DUPLICATE') return DUPLICATE_BY_CONSTRAINT[err.constraint];
  if (err.code === 'CHECK_FAILED') return CHECK_BY_PREFIX.find(([prefix]) => err.constraint?.startsWith(prefix))?.[1];
  if (err.code === 'FK_NOT_FOUND') return 'REFERENCE_NOT_FOUND';
  if (err.code === 'FK_IN_USE') return 'RESOURCE_IN_USE';
  return undefined;
}
