import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { query, transaction } from '../db.js';
import { AppError, forbidden, unauthorized } from '../utils/errors.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { writeAudit } from '../utils/audit.js';
import { getUser } from './userService.js';

const INVALID = () => unauthorized('INVALID_CREDENTIALS', 'Invalid username or password');

async function recordFailure(user, reason, username, ctx) {
  if (user) {
    await query(
      `UPDATE users
          SET locked_until = CASE WHEN failed_login_count + 1 >= ? THEN DATE_ADD(NOW(), INTERVAL ? MINUTE) ELSE locked_until END,
              failed_login_count = CASE WHEN failed_login_count + 1 >= ? THEN 0 ELSE failed_login_count + 1 END
        WHERE id = ?`,
      [config.maxFailedLogins, config.lockMinutes, config.maxFailedLogins, user.id]);
  }
  await writeAudit(null, {
    action: 'LOGIN_FAILED', entityType: 'auth', entityId: user?.id ?? null, ctx,
    details: { username: username.slice(0, 100), reason },
  });
}

export async function login(username, password, ctx) {
  const { rows: [user] } = await query(
    `SELECT u.id, u.password_hash, u.token_version, u.locked_until, s.code AS status
       FROM users u JOIN user_statuses s ON s.id = u.status_id
      WHERE u.username = ? AND u.deleted_at IS NULL`, [username.toLowerCase()]);

  if (user?.locked_until && user.locked_until > new Date()) {
    await recordFailure(null, 'ACCOUNT_LOCKED', username, ctx);
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Account is temporarily locked. Try again later.');
  }

  const ok = await verifyPassword(password, user?.password_hash);
  if (!user || !ok) {
    await recordFailure(user, user ? 'BAD_PASSWORD' : 'UNKNOWN_USER', username, ctx);
    throw INVALID();
  }
  if (user.status !== 'active') {
    await recordFailure(null, 'ACCOUNT_INACTIVE', username, ctx);
    throw forbidden('ACCOUNT_INACTIVE', 'Account is inactive');
  }

  await query(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [user.id]);
  await writeAudit(null, { actorId: user.id, action: 'LOGIN_SUCCESS', entityType: 'auth', entityId: user.id, ctx });

  const accessToken = jwt.sign({ ver: user.token_version }, config.jwtSecret, {
    algorithm: 'HS256',
    subject: user.id,
    issuer: config.jwtIssuer,
    expiresIn: config.jwtExpiresIn,
    jwtid: randomUUID(),
  });
  const { exp, iat } = jwt.decode(accessToken);
  return { accessToken, tokenType: 'Bearer', expiresIn: exp - iat, user: await getUser(user.id) };
}

export async function logout(auth, ctx) {
  await transaction(async (tx) => {
    await tx.query(
      `INSERT INTO revoked_tokens (jti, user_id, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))
       ON DUPLICATE KEY UPDATE jti = jti`, [auth.jti, auth.user.id, auth.exp]);
    await tx.query('DELETE FROM revoked_tokens WHERE expires_at < NOW()');
    await writeAudit(tx, { actorId: auth.user.id, action: 'LOGOUT', entityType: 'auth', entityId: auth.user.id, ctx });
  });
}

export async function changeOwnPassword(auth, currentPassword, newPassword, ctx) {
  const { rows: [row] } = await query('SELECT password_hash FROM users WHERE id = ?', [auth.user.id]);
  if (!(await verifyPassword(currentPassword, row.password_hash))) {
    await writeAudit(null, {
      actorId: auth.user.id, action: 'PASSWORD_CHANGE_FAILED', entityType: 'user', entityId: auth.user.id, ctx,
    });
    throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect');
  }
  const passwordHash = await hashPassword(newPassword);
  await transaction(async (tx) => {
    await tx.query(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW(), token_version = token_version + 1,
              updated_by = ? WHERE id = ?`, [passwordHash, auth.user.id, auth.user.id]);
    await writeAudit(tx, {
      actorId: auth.user.id, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: auth.user.id, ctx,
    });
  });
}
