// แปลง error ทุกชนิดเป็น { success: false, error: { code, message, details } } ไม่ส่ง stack ให้ผู้ใช้
import multer from 'multer';
import { AppError } from '../services/index.js';
import { toAppError } from '../services/core/dbErrorMapper.js';

export function notFound(req, res, next) {
  next(new AppError('NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let appError;
  if (err instanceof multer.MulterError || err?.code === 'INVALID_FILE') appError = new AppError('INVALID_FILE');
  else if (err?.type === 'entity.parse.failed') appError = new AppError('VALIDATION_ERROR', { details: [{ field: 'body', message: 'JSON ไม่ถูกต้อง' }] });
  else appError = toAppError(err);

  const { code, message, details, status } = appError;
  res.status(status).json({ success: false, error: { code, message, ...(details === undefined ? {} : { details }) } });
}
