// hash / ตรวจรหัสผ่านด้วย bcryptjs (ใช้ hash $2b$ จาก seed ได้)
import bcrypt from 'bcryptjs';

const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

/** @param {string} plain @returns {Promise<string>} */
export function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

/** @param {string} plain @param {string} hash @returns {Promise<boolean>} */
export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
