import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { requestContext, writeAudit } from '../utils/audit.js';

const AUTH_SQL = `
  SELECT u.id, u.username, u.email, u.token_version, s.code AS status,
         GROUP_CONCAT(DISTINCT r.name) AS roles_csv,
         GROUP_CONCAT(DISTINCT p.code) AS permissions_csv
    FROM users u
    JOIN user_statuses s ON s.id = u.status_id
    LEFT JOIN user_roles ur        ON ur.user_id = u.id
    LEFT JOIN roles r              ON r.id = ur.role_id
    LEFT JOIN role_permissions rp  ON rp.role_id = r.id
    LEFT JOIN permissions p        ON p.id = rp.permission_id
   WHERE u.id = ? AND u.deleted_at IS NULL
   GROUP BY u.id, u.username, u.email, u.token_version, s.code`;

const split = (csv) => (csv ? csv.split(',') : []);

export async function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized('TOKEN_MISSING');

  let claims;
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: config.jwtIssuer });
  } catch (err) {
    throw unauthorized(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      err.name === 'TokenExpiredError' ? 'Token has expired' : 'Token is invalid');
  }

  const revoked = await query('SELECT 1 FROM revoked_tokens WHERE jti = ?', [claims.jti]);
  if (revoked.rowCount) throw unauthorized('TOKEN_REVOKED', 'Token has been revoked');

  // Roles and permissions come from the DB on every request, so a role change
  // or deactivation takes effect immediately instead of when the JWT expires.
  const { rows: [row] } = await query(AUTH_SQL, [claims.sub]);
  const user = row && { ...row, roles: split(row.roles_csv), permissions: split(row.permissions_csv) };
  if (!user || user.status !== 'active' || user.token_version !== claims.ver) {
    throw unauthorized('TOKEN_INVALID', 'Token is no longer valid');
  }

  req.auth = { user, jti: claims.jti, exp: claims.exp };
  next();
}

export const authorize = (...required) => async (req, _res, next) => {
  const granted = new Set(req.auth.user.permissions);
  const missing = required.filter((p) => !granted.has(p));
  if (missing.length) {
    await writeAudit(null, {
      actorId: req.auth.user.id,
      action: 'ACCESS_DENIED',
      entityType: 'auth',
      details: { method: req.method, path: req.originalUrl.split('?')[0], missing },
      ctx: requestContext(req),
    });
    throw forbidden();
  }
  next();
};
