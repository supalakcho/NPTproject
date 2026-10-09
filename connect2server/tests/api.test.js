import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  PASSWORD, api, auditActions, bearer, insertUser, newUserBody, query, setupDb, tokenFor,
} from './helpers.js';

let testDb;
let admin;
let manager;
let plain;

before(async () => {
  testDb = await setupDb();
  await insertUser('admin1', ['admin']);
  await insertUser('manager1', ['manager']);
  await insertUser('plain1', ['user']);
  [admin, manager, plain] = await Promise.all([tokenFor('admin1'), tokenFor('manager1'), tokenFor('plain1')]);
});
after(() => testDb.close());

describe('V1 database: normalization and foreign keys', () => {
  it('declares the expected foreign keys', async () => {
    const { rows } = await query(`
      SELECT table_name AS tbl, referenced_table_name AS target
        FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL`);
    const has = (tbl, target) => rows.some((r) => r.tbl === tbl && r.target === target);
    assert.ok(has('user_roles', 'users'));
    assert.ok(has('user_roles', 'roles'));
    assert.ok(has('role_permissions', 'roles'));
    assert.ok(has('role_permissions', 'permissions'));
    assert.ok(has('users', 'user_statuses'));
    assert.ok(has('user_profiles', 'users'));
    assert.ok(has('audit_logs', 'users'));
    assert.ok(has('revoked_tokens', 'users'));
  });

  it('keeps no repeating groups: role names and permissions live only in lookup tables', async () => {
    const { rows } = await query(`SELECT column_name AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users'`);
    const cols = rows.map((r) => r.column_name);
    for (const c of ['role', 'roles', 'permissions', 'status', 'first_name', 'phone']) {
      assert.ok(!cols.includes(c), `users must not carry ${c}`);
    }
  });

  it('rejects a user row whose password_hash is not a bcrypt hash', async () => {
    await assert.rejects(
      query(`INSERT INTO users (username, email, password_hash) VALUES ('rawpw', 'rawpw@example.com', 'plain-text')`),
      /ck_users_hash_bcrypt/);
  });

  it('rejects an orphan user_roles row', async () => {
    await assert.rejects(
      query(`INSERT INTO user_roles (user_id, role_id) VALUES (UUID(), 1)`), /foreign key/i);
  });
});

describe('V3 login', () => {
  it('succeeds with correct credentials and returns a Bearer JWT, never the hash', async () => {
    const res = await api().post('/api/v1/auth/login').send({ username: 'ADMIN1', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.tokenType, 'Bearer');
    assert.equal(res.body.data.user.username, 'admin1');
    assert.deepEqual(res.body.data.user.roles, ['admin']);
    assert.ok(!JSON.stringify(res.body).includes('password_hash'));
    assert.ok(!JSON.stringify(res.body).includes('$2b$'));
    assert.equal(jwt.decode(res.body.data.accessToken).sub, res.body.data.user.id);
  });

  it('fails with 401 for a wrong password and for an unknown user, with identical bodies', async () => {
    const bad = await api().post('/api/v1/auth/login').send({ username: 'admin1', password: 'nope-nope-nope' });
    const ghost = await api().post('/api/v1/auth/login').send({ username: 'ghost', password: 'nope-nope-nope' });
    assert.equal(bad.status, 401);
    assert.equal(ghost.status, 401);
    assert.deepEqual(bad.body, ghost.body);
    assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('returns 400 for a missing field', async () => {
    const res = await api().post('/api/v1/auth/login').send({ username: 'admin1' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await api().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('locks the account after MAX_FAILED_LOGINS failures (423), even for the right password', async () => {
    await insertUser('locky');
    for (let i = 0; i < 3; i++) {
      const r = await api().post('/api/v1/auth/login').send({ username: 'locky', password: 'wrong-wrong-1' });
      assert.equal(r.status, 401);
    }
    const locked = await api().post('/api/v1/auth/login').send({ username: 'locky', password: PASSWORD });
    assert.equal(locked.status, 423);
    assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');
  });

  it('blocks inactive accounts with 403 only after the correct password', async () => {
    await insertUser('sleepy');
    await query(`UPDATE users SET status_id = 2 WHERE username = 'sleepy'`);
    const res = await api().post('/api/v1/auth/login').send({ username: 'sleepy', password: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ACCOUNT_INACTIVE');
  });
});

describe('V4 JWT validation and authorization', () => {
  const protectedRoutes = [
    ['get', '/api/v1/users'], ['post', '/api/v1/users'], ['get', '/api/v1/users/00000000-0000-4000-8000-000000000000'],
    ['patch', '/api/v1/users/00000000-0000-4000-8000-000000000000'], ['delete', '/api/v1/users/00000000-0000-4000-8000-000000000000'],
    ['post', '/api/v1/users/00000000-0000-4000-8000-000000000000/reset-password'], ['get', '/api/v1/roles'],
    ['get', '/api/v1/audit-logs'], ['get', '/api/v1/auth/me'], ['post', '/api/v1/auth/logout'],
    ['post', '/api/v1/auth/change-password'],
  ];

  it('every route except login returns 401 TOKEN_MISSING without a token', async () => {
    for (const [method, url] of protectedRoutes) {
      const res = await api()[method](url);
      assert.equal(res.status, 401, `${method} ${url}`);
      assert.equal(res.body.error.code, 'TOKEN_MISSING');
    }
  });

  it('rejects garbage, tampered, wrong-secret, alg=none and expired tokens', async () => {
    const claims = jwt.decode(admin);
    const forged = jwt.sign({ ver: claims.ver }, 'x'.repeat(40), { subject: claims.sub, issuer: 'user-management', jwtid: 'a8f1d9f8-1c3b-4d1c-9f55-0a6f3d0d7a11' });
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`;
    const expired = jwt.sign({ ver: claims.ver }, process.env.JWT_SECRET, {
      subject: claims.sub, issuer: 'user-management', jwtid: 'b8f1d9f8-1c3b-4d1c-9f55-0a6f3d0d7a11', expiresIn: -10,
    });
    for (const t of ['garbage', `${admin.slice(0, -3)}abc`, forged, none]) {
      const res = await api().get('/api/v1/users').set(bearer(t));
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'TOKEN_INVALID');
    }
    const res = await api().get('/api/v1/users').set(bearer(expired));
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
  });

  it('enforces RBAC: plain user 403, manager can read/create but not update/delete/audit', async () => {
    const target = await insertUser('rbac-target');
    assert.equal((await api().get('/api/v1/users').set(bearer(plain))).status, 403);
    assert.equal((await api().get('/api/v1/users').set(bearer(manager))).status, 200);
    assert.equal((await api().post('/api/v1/users').set(bearer(manager)).send(newUserBody('by-manager'))).status, 201);
    assert.equal((await api().patch(`/api/v1/users/${target}`).set(bearer(manager)).send({ phone: '1' })).status, 403);
    assert.equal((await api().delete(`/api/v1/users/${target}`).set(bearer(manager))).status, 403);
    assert.equal((await api().post(`/api/v1/users/${target}/reset-password`).set(bearer(manager)).send({ newPassword: PASSWORD })).status, 403);
    assert.equal((await api().get('/api/v1/audit-logs').set(bearer(manager))).status, 403);
    assert.equal((await api().get('/api/v1/audit-logs').set(bearer(admin))).status, 200);
  });

  it('prevents privilege escalation: manager cannot pick roles', async () => {
    const res = await api().post('/api/v1/users').set(bearer(manager)).send(newUserBody('sneaky', { roles: ['admin'] }));
    assert.equal(res.status, 403);
    const { rowCount } = await query(`SELECT 1 FROM users WHERE username = 'sneaky'`);
    assert.equal(rowCount, 0);
  });

  it('applies role changes immediately (permissions are read per request, not baked into the JWT)', async () => {
    const id = await insertUser('promoted', ['manager']);
    const t = await tokenFor('promoted');
    assert.equal((await api().get('/api/v1/users').set(bearer(t))).status, 200);
    await query(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
    assert.equal((await api().get('/api/v1/users').set(bearer(t))).status, 403);
  });

  it('logout revokes the token (204 then 401 TOKEN_REVOKED)', async () => {
    const t = await tokenFor('plain1');
    assert.equal((await api().post('/api/v1/auth/logout').set(bearer(t))).status, 204);
    const res = await api().get('/api/v1/auth/me').set(bearer(t));
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_REVOKED');
  });

  it('deactivation invalidates tokens that were already issued', async () => {
    await insertUser('victim');
    const t = await tokenFor('victim');
    const { rows: [v] } = await query(`SELECT id FROM users WHERE username = 'victim'`);
    assert.equal((await api().patch(`/api/v1/users/${v.id}`).set(bearer(admin)).send({ status: 'inactive' })).status, 200);
    assert.equal((await api().get('/api/v1/auth/me').set(bearer(t))).status, 401);
  });
});

describe('V5/V6/V8 user CRUD, duplicates, status codes', () => {
  let id;

  it('POST creates (201 + Location), defaulting to the "user" role', async () => {
    const res = await api().post('/api/v1/users').set(bearer(admin))
      .send(newUserBody('Alice.Smith', { firstName: 'Alice', lastName: 'Smith', phone: '+66 81-234-5678' }));
    assert.equal(res.status, 201);
    id = res.body.data.id;
    assert.equal(res.headers.location, `/api/v1/users/${id}`);
    assert.equal(res.body.data.username, 'alice.smith');
    assert.deepEqual(res.body.data.roles, ['user']);
    assert.ok(!('password' in res.body.data) && !('passwordHash' in res.body.data));
  });

  it('V2 stores only a bcrypt hash of the password', async () => {
    const { rows: [row] } = await query(`SELECT password_hash FROM users WHERE id = ?`, [id]);
    assert.notEqual(row.password_hash, PASSWORD);
    assert.match(row.password_hash, /^\$2b\$\d\d\$/);
    assert.ok(await bcrypt.compare(PASSWORD, row.password_hash));
    const { rows } = await query(`SELECT 1 FROM audit_logs WHERE details LIKE ?`, [`%${PASSWORD}%`]);
    assert.equal(rows.length, 0, 'plain password must never reach the audit log');
  });

  it('GET one returns 200; unknown id 404; malformed id 400', async () => {
    assert.equal((await api().get(`/api/v1/users/${id}`).set(bearer(admin))).body.data.email, 'alice.smith@example.com');
    const missing = await api().get('/api/v1/users/00000000-0000-4000-8000-000000000000').set(bearer(admin));
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'USER_NOT_FOUND');
    assert.equal((await api().get('/api/v1/users/not-a-uuid').set(bearer(admin))).status, 400);
  });

  it('rejects duplicate username and email with 409, case-insensitively', async () => {
    const dupName = await api().post('/api/v1/users').set(bearer(admin)).send(newUserBody('ALICE.SMITH', { email: 'other@example.com' }));
    assert.equal(dupName.status, 409);
    assert.equal(dupName.body.error.code, 'USERNAME_TAKEN');
    const dupMail = await api().post('/api/v1/users').set(bearer(admin)).send(newUserBody('alice2', { email: 'Alice.Smith@Example.com' }));
    assert.equal(dupMail.status, 409);
    assert.equal(dupMail.body.error.code, 'EMAIL_TAKEN');
    const { rowCount } = await query(`SELECT 1 FROM users WHERE username = 'alice2'`);
    assert.equal(rowCount, 0, 'failed insert must roll back');
  });

  it('validates the body: weak password, bad username, bad email, unknown field, unknown role', async () => {
    const post = (b) => api().post('/api/v1/users').set(bearer(admin)).send(b);
    for (const [body, field] of [
      [newUserBody('weakpw', { password: 'short' }), 'password'],
      [newUserBody('weakpw', { password: 'alllowercase1234!' }), 'password'],
      [newUserBody('x'), 'username'],
      [newUserBody('has space'), 'username'],
      [newUserBody('bademail', { email: 'nope' }), 'email'],
    ]) {
      const res = await post(body);
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some((d) => d.field === field), `expected error on ${field}`);
    }
    assert.equal((await post(newUserBody('extra1', { isAdmin: true }))).status, 400);
    const role = await post(newUserBody('badrole', { roles: ['superman'] }));
    assert.equal(role.status, 400);
    assert.equal(role.body.error.code, 'INVALID_ROLE');
  });

  it('PATCH updates profile, email, status and roles; duplicate email is 409', async () => {
    const res = await api().patch(`/api/v1/users/${id}`).set(bearer(admin))
      .send({ firstName: 'Alicia', email: 'alicia@example.com', roles: ['manager', 'user'], status: 'inactive' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.firstName, 'Alicia');
    assert.deepEqual(res.body.data.roles, ['manager', 'user']);
    assert.equal(res.body.data.status, 'inactive');
    const dup = await api().patch(`/api/v1/users/${id}`).set(bearer(admin)).send({ email: 'admin1@example.com' });
    assert.equal(dup.status, 409);
    assert.equal((await api().patch(`/api/v1/users/${id}`).set(bearer(admin)).send({})).status, 400);
    assert.equal((await api().patch(`/api/v1/users/${id}`).set(bearer(admin)).send({ username: 'renamed' })).status, 400);
  });

  it('reset-password changes the hash and the new password works', async () => {
    const res = await api().post(`/api/v1/users/${id}/reset-password`).set(bearer(admin)).send({ newPassword: 'Br4nd!NewPassw0rd' });
    assert.equal(res.status, 204);
    await api().patch(`/api/v1/users/${id}`).set(bearer(admin)).send({ status: 'active' });
    const login = await api().post('/api/v1/auth/login').send({ username: 'alice.smith', password: 'Br4nd!NewPassw0rd' });
    assert.equal(login.status, 200);
  });

  it('GET list: pagination, search, filters and sorting', async () => {
    for (let i = 0; i < 5; i++) await api().post('/api/v1/users').set(bearer(admin)).send(newUserBody(`bulk${i}`, { firstName: 'Bulk' }));
    const p1 = await api().get('/api/v1/users?limit=2&page=1&sort=username&order=asc').set(bearer(admin));
    assert.equal(p1.status, 200);
    assert.equal(p1.body.data.length, 2);
    assert.equal(p1.body.meta.page, 1);
    assert.ok(p1.body.meta.total >= 8);
    const p2 = await api().get('/api/v1/users?limit=2&page=2&sort=username&order=asc').set(bearer(admin));
    assert.notDeepEqual(p1.body.data.map((u) => u.id), p2.body.data.map((u) => u.id));
    const names = p1.body.data.map((u) => u.username);
    assert.deepEqual(names, [...names].sort());

    const search = await api().get('/api/v1/users?search=BULK').set(bearer(admin));
    assert.equal(search.body.meta.total, 5);
    assert.equal((await api().get('/api/v1/users?search=%25').set(bearer(admin))).body.meta.total, 0, 'LIKE wildcards are escaped');
    const byRole = await api().get('/api/v1/users?role=admin').set(bearer(admin));
    assert.ok(byRole.body.data.every((u) => u.roles.includes('admin')));
    const byStatus = await api().get('/api/v1/users?status=inactive').set(bearer(admin));
    assert.ok(byStatus.body.data.every((u) => u.status === 'inactive'));
    assert.equal((await api().get('/api/v1/users?limit=1000').set(bearer(admin))).status, 400);
    assert.equal((await api().get('/api/v1/users?sort=password_hash').set(bearer(admin))).status, 400);
  });

  it('DELETE soft-deletes (204), then 404, and the username can be reused', async () => {
    assert.equal((await api().delete(`/api/v1/users/${id}`).set(bearer(admin))).status, 204);
    assert.equal((await api().get(`/api/v1/users/${id}`).set(bearer(admin))).status, 404);
    assert.equal((await api().delete(`/api/v1/users/${id}`).set(bearer(admin))).status, 404);
    const { rows: [row] } = await query(`SELECT deleted_at FROM users WHERE id = ?`, [id]);
    assert.ok(row.deleted_at, 'row is kept for audit integrity');
    const reuse = await api().post('/api/v1/users').set(bearer(admin)).send(newUserBody('alice.smith'));
    assert.equal(reuse.status, 201);
  });

  it('blocks self-delete and self-lockout', async () => {
    const { rows: [me] } = await query(`SELECT id FROM users WHERE username = 'admin1'`);
    assert.equal((await api().delete(`/api/v1/users/${me.id}`).set(bearer(admin))).body.error.code, 'SELF_DELETE');
    assert.equal((await api().patch(`/api/v1/users/${me.id}`).set(bearer(admin)).send({ roles: ['user'] })).body.error.code, 'SELF_LOCKOUT');
    assert.equal((await api().patch(`/api/v1/users/${me.id}`).set(bearer(admin)).send({ status: 'inactive' })).body.error.code, 'SELF_LOCKOUT');
  });

  it('never lets anyone remove the last active admin (e.g. a custom HR role)', async () => {
    await query(`INSERT INTO roles (name) VALUES ('hr')`);
    await query(`INSERT INTO role_permissions (role_id, permission_id)
                 SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('user:update', 'user:delete')
                  WHERE r.name = 'hr'`);
    await insertUser('hr1', ['hr']);
    const hr = await tokenFor('hr1');
    const { rows: [a1] } = await query(`SELECT id FROM users WHERE username = 'admin1'`);
    const del = await api().delete(`/api/v1/users/${a1.id}`).set(bearer(hr));
    assert.equal(del.status, 409);
    assert.equal(del.body.error.code, 'LAST_ADMIN');
    const off = await api().patch(`/api/v1/users/${a1.id}`).set(bearer(hr)).send({ status: 'inactive' });
    assert.equal(off.body.error.code, 'LAST_ADMIN');
  });
});

describe('own account', () => {
  it('GET /auth/me returns profile and permissions', async () => {
    const res = await api().get('/api/v1/auth/me').set(bearer(admin));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.permissions.includes('user:delete'));
  });

  it('change-password: wrong current 400, success 204, old token dead, new password works', async () => {
    await insertUser('changer');
    const t = await tokenFor('changer');
    const bad = await api().post('/api/v1/auth/change-password').set(bearer(t)).send({ currentPassword: 'wrong', newPassword: 'An0ther!Passw0rd' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'CURRENT_PASSWORD_INCORRECT');
    const weak = await api().post('/api/v1/auth/change-password').set(bearer(t)).send({ currentPassword: PASSWORD, newPassword: 'weak' });
    assert.equal(weak.status, 400);
    const ok = await api().post('/api/v1/auth/change-password').set(bearer(t)).send({ currentPassword: PASSWORD, newPassword: 'An0ther!Passw0rd' });
    assert.equal(ok.status, 204);
    assert.equal((await api().get('/api/v1/auth/me').set(bearer(t))).status, 401);
    assert.equal((await api().post('/api/v1/auth/login').send({ username: 'changer', password: PASSWORD })).status, 401);
    assert.equal((await api().post('/api/v1/auth/login').send({ username: 'changer', password: 'An0ther!Passw0rd' })).status, 200);
  });
});

describe('V7 audit log', () => {
  it('records every important activity', async () => {
    const actions = new Set(await auditActions());
    for (const a of [
      'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
      'PASSWORD_RESET', 'PASSWORD_CHANGED', 'PASSWORD_CHANGE_FAILED', 'ACCESS_DENIED',
    ]) assert.ok(actions.has(a), `missing audit action ${a}`);
  });

  it('captures actor, entity, field-level changes, ip and user agent', async () => {
    const res = await api().get('/api/v1/audit-logs?action=USER_UPDATED&entityType=user&limit=5').set(bearer(admin));
    assert.equal(res.status, 200);
    const entry = res.body.data[0];
    assert.equal(entry.actor.username, 'admin1');
    assert.ok(entry.entityId);
    assert.ok(entry.details.changes);
    assert.ok(entry.ipAddress);
    assert.ok(res.body.data.every((e) => e.action === 'USER_UPDATED'));
  });

  it('failed logins record the attempted username and reason, but never the password', async () => {
    await api().post('/api/v1/auth/login').send({ username: 'audit-ghost', password: 'Sup3r!SecretGuess' });
    const { rows } = await query(`SELECT details FROM audit_logs WHERE action = 'LOGIN_FAILED' AND JSON_VALUE(details, '$.username') = 'audit-ghost'`);
    assert.equal(JSON.parse(rows[0].details).reason, 'UNKNOWN_USER');
    const all = await query(`SELECT 1 FROM audit_logs WHERE details LIKE '%Sup3r!SecretGuess%'`);
    assert.equal(all.rowCount, 0);
  });

  it('writes the audit row in the same transaction as the change (rolled back together)', async () => {
    const before = await query(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'USER_CREATED'`);
    const dup = await api().post('/api/v1/users').set(bearer(admin)).send(newUserBody('plain1'));
    assert.equal(dup.status, 409);
    const after = await query(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'USER_CREATED'`);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });
});

describe('misc', () => {
  it('unknown API route is a JSON 404', async () => {
    const res = await api().get('/api/v1/nope').set(bearer(admin));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
  });

  it('GET /api/v1/roles lists roles with permissions', async () => {
    const res = await api().get('/api/v1/roles').set(bearer(admin));
    assert.equal(res.status, 200);
    const names = res.body.data.map((r) => r.name);
    for (const n of ['admin', 'manager', 'user']) assert.ok(names.includes(n));
    assert.ok(res.body.data.find((r) => r.name === 'manager').permissions.includes('user:create'));
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await api().get('/health');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-security-policy']);
    assert.equal(res.headers['x-powered-by'], undefined);
  });
});
