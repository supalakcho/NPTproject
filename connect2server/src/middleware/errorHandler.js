import { AppError } from '../utils/errors.js';

export const notFoundHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let { status, code, message, details } = err;

  if (!(err instanceof AppError)) {
    if (err.type === 'entity.parse.failed') {
      [status, code, message] = [400, 'INVALID_JSON', 'Request body is not valid JSON'];
    } else if (err.type === 'entity.too.large') {
      [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'];
    } else {
      console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
      [status, code, message, details] = [500, 'INTERNAL_ERROR', 'Internal server error', undefined];
    }
  }

  res.status(status).json({ error: { code, message, ...(details && { details }) } });
}
