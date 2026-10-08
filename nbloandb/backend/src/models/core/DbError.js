// แปลง error ของ MySQL/MariaDB เป็น DbError ที่มี code อ่านง่าย

const CODE_BY_ERRNO = {
  1062: 'DUPLICATE',
  1452: 'FK_NOT_FOUND',
  1451: 'FK_IN_USE',
  4025: 'CHECK_FAILED', // MariaDB
  3819: 'CHECK_FAILED', // MySQL
};

const CONSTRAINT_PATTERNS = [
  /for key '(?:[^'.]*\.)?([^']+)'/, // 1062: Duplicate entry 'x' for key 'uq_users_email'
  /CONSTRAINT `([^`]+)`/, // 1451, 1452, 4025
  /Check constraint '([^']+)'/, // 3819 (MySQL)
];

export class DbError extends Error {
  /**
   * @param {'DUPLICATE'|'FK_NOT_FOUND'|'FK_IN_USE'|'CHECK_FAILED'|'INVALID_COLUMN'|'DB_ERROR'} code
   * @param {string} message
   * @param {{ constraint?: string|null, cause?: Error }} [extra]
   *   cause = error เดิม ไว้ log เท่านั้น ห้ามส่งให้ผู้ใช้
   */
  constructor(code, message, { constraint = null, cause } = {}) {
    super(message, { cause });
    this.name = 'DbError';
    this.code = code;
    this.constraint = constraint;
  }

  /**
   * ห่อ error จาก mysql2 เป็น DbError (ถ้าเป็น DbError อยู่แล้วคืนตัวเดิม)
   * @param {Error & { errno?: number }} err
   * @returns {DbError}
   * @example
   * try { await conn.execute(sql, params); } catch (e) { throw DbError.from(e); }
   */
  static from(err) {
    if (err instanceof DbError) return err;
    const code = CODE_BY_ERRNO[err.errno] ?? 'DB_ERROR';
    let constraint = null;
    if (code !== 'DB_ERROR') {
      for (const pattern of CONSTRAINT_PATTERNS) {
        const match = pattern.exec(err.message ?? '');
        if (match) {
          constraint = match[1];
          break;
        }
      }
    }
    return new DbError(code, err.message, { constraint, cause: err });
  }
}
