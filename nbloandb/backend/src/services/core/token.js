// สร้าง / ตรวจ JWT
import jwt from 'jsonwebtoken';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be set (at least 32 characters)');
  return value;
}

/**
 * @param {{ userId: number, roleId: number, roleCode: string }} claims
 * @returns {{ token: string, expiresAt: Date }}
 */
export function signToken({ userId, roleId, roleCode }) {
  const token = jwt.sign({ roleId, roleCode }, secret(), {
    subject: String(userId),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  });
  return { token, expiresAt: new Date(jwt.decode(token).exp * 1000) };
}

/**
 * @param {string} token
 * @returns {{ userId: number }|null} null = token ผิดหรือหมดอายุ
 */
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, secret());
    return { userId: Number(payload.sub) };
  } catch {
    return null;
  }
}
