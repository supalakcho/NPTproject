// error ที่ service throw ทุกครั้ง error middleware แปลงเป็น HTTP response
import { ERROR_CODES } from './errorCodes.js';

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {{ details?: unknown, message?: string, params?: Record<string, unknown> }} [extra]
   *   params แทนค่า {n} ในข้อความ เช่น { n: 7 }
   * @example
   * throw new AppError('RESERVATION_TOO_FAR_AHEAD', { params: { n: 7 } });
   */
  constructor(code, { details, message, params } = {}) {
    const def = ERROR_CODES[code];
    if (!def) throw new Error(`Unknown error code: ${code}`);
    const text = message ?? def.message.replace(/\{(\w+)\}/g, (m, key) => (params?.[key] ?? m));
    super(text);
    this.name = 'AppError';
    this.code = code;
    this.status = def.status;
    this.details = details;
  }
}
