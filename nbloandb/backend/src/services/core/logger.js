// เขียน log เป็น JSON บรรทัดละรายการ ลงไฟล์ logs/app-YYYY-MM-DD.log
import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.resolve(process.env.LOG_DIR ?? './logs');
let dirReady = false;

function write(level, message, meta) {
  const now = new Date();
  const day = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD เวลาไทย
  const line = JSON.stringify({ time: now.toISOString(), level, message, ...meta }) + '\n';
  try {
    if (!dirReady) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      dirReady = true;
    }
    fs.appendFileSync(path.join(LOG_DIR, `app-${day}.log`), line);
  } catch (err) {
    console.error('logger failed', err, line);
  }
}

function errorMeta(err) {
  if (!err) return {};
  return { error: { name: err.name, code: err.code, message: err.message, stack: err.stack, cause: err.cause?.message } };
}

export const logger = {
  /** @param {string} message @param {object} [meta] */
  info: (message, meta = {}) => write('info', message, meta),
  /** @param {string} message @param {object} [meta] */
  warn: (message, meta = {}) => write('warn', message, meta),
  /** @param {string} message @param {Error} [err] @param {object} [meta] */
  error: (message, err, meta = {}) => write('error', message, { ...meta, ...errorMeta(err) }),
};
