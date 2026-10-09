// Regenerates postman/user-management.postman_collection.json:  node scripts/gen-postman.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../postman/user-management.postman_collection.json', import.meta.url);

// token: variable name holding the bearer token, or null for an unauthenticated call.
const req = (name, method, path, { body, token = 'token', tests = [], pre } = {}) => {
  const [pathname, qs] = path.split('?');
  return {
    name,
    event: [
      ...(pre ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } }] : []),
      { listen: 'test', script: { type: 'text/javascript', exec: tests } },
    ],
    request: {
      method,
      header: [
        ...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []),
        ...(token ? [{ key: 'Authorization', value: `Bearer {{${token}}}` }] : []),
      ],
      ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2) } } : {}),
      url: {
        raw: `{{baseUrl}}${path}`,
        host: ['{{baseUrl}}'],
        path: pathname.split('/').filter(Boolean),
        ...(qs && { query: qs.split('&').map((p) => ({ key: p.split('=')[0], value: p.split('=')[1] })) }),
      },
    },
  };
};

const status = (c) => `pm.test('status is ${c}', () => pm.response.to.have.status(${c}));`;
const errCode = (c) => `pm.test('error code ${c}', () => pm.expect(pm.response.json().error.code).to.eql('${c}'));`;
const uniqueUser = [
  'const n = Date.now().toString(36);',
  "pm.collectionVariables.set('newUser', 'pm_' + n);",
  "pm.collectionVariables.set('newEmail', 'pm_' + n + '@example.com');",
];
const GOOD = 'Str0ng!Passw0rd';

const folders = [
  { name: '1. Auth', item: [
    req('Login (success)', 'POST', '/api/v1/auth/login', {
      token: null, body: { username: '{{adminUser}}', password: '{{adminPassword}}' },
      tests: [status(200), 'const d = pm.response.json().data;',
        "pm.test('bearer token', () => pm.expect(d.accessToken).to.be.a('string'));",
        "pm.test('no hash leaked', () => pm.expect(pm.response.text()).to.not.include('$2b$'));",
        "pm.collectionVariables.set('token', d.accessToken);"] }),
    req('Login (wrong password)', 'POST', '/api/v1/auth/login', {
      token: null, body: { username: '{{adminUser}}', password: 'definitely-wrong-1A!' }, tests: [status(401), errCode('INVALID_CREDENTIALS')] }),
    req('Login (missing field)', 'POST', '/api/v1/auth/login', {
      token: null, body: { username: '{{adminUser}}' }, tests: [status(400), errCode('VALIDATION_ERROR')] }),
    req('Me', 'GET', '/api/v1/auth/me', {
      tests: [status(200), "pm.test('permissions array', () => pm.expect(pm.response.json().data.permissions).to.be.an('array'));"] }),
    req('Me (no token)', 'GET', '/api/v1/auth/me', { token: null, tests: [status(401), errCode('TOKEN_MISSING')] }),
    req('Me (garbage token)', 'GET', '/api/v1/auth/me', { token: 'badToken', tests: [status(401), errCode('TOKEN_INVALID')] }),
  ] },
  { name: '2. Users CRUD', item: [
    req('Create user', 'POST', '/api/v1/users', {
      pre: uniqueUser, body: { username: '{{newUser}}', email: '{{newEmail}}', password: GOOD, firstName: 'Postman', lastName: 'Tester' },
      tests: [status(201), 'const u = pm.response.json().data;', "pm.collectionVariables.set('userId', u.id);",
        "pm.test('Location header', () => pm.expect(pm.response.headers.get('Location')).to.eql('/api/v1/users/' + u.id));",
        "pm.test('default role', () => pm.expect(u.roles).to.eql(['user']));",
        "pm.test('password not echoed', () => pm.expect(pm.response.text()).to.not.include('Str0ng'));"] }),
    req('Create duplicate username', 'POST', '/api/v1/users', {
      body: { username: '{{newUser}}', email: 'other-{{newEmail}}', password: GOOD }, tests: [status(409), errCode('USERNAME_TAKEN')] }),
    req('Create duplicate email', 'POST', '/api/v1/users', {
      body: { username: 'x{{newUser}}', email: '{{newEmail}}', password: GOOD }, tests: [status(409), errCode('EMAIL_TAKEN')] }),
    req('Create weak password', 'POST', '/api/v1/users', {
      body: { username: 'weak_{{newUser}}', email: 'weak-{{newEmail}}', password: 'weak' }, tests: [status(400), errCode('VALIDATION_ERROR')] }),
    req('Get user', 'GET', '/api/v1/users/{{userId}}', {
      tests: [status(200), "pm.test('same id', () => pm.expect(pm.response.json().data.id).to.eql(pm.collectionVariables.get('userId')));"] }),
    req('List users (paginate + search)', 'GET', '/api/v1/users?page=1&limit=5&search=pm_&sort=username&order=asc', {
      tests: [status(200), 'const b = pm.response.json();',
        "pm.test('page size', () => pm.expect(b.data.length).to.be.at.most(5));",
        "pm.test('meta', () => pm.expect(b.meta).to.include.keys('page', 'limit', 'total', 'totalPages'));"] }),
    req('List users (invalid limit)', 'GET', '/api/v1/users?limit=1000', { tests: [status(400)] }),
    req('Update user (give manager role)', 'PATCH', '/api/v1/users/{{userId}}', {
      body: { firstName: 'Updated', roles: ['manager', 'user'] },
      tests: [status(200), "pm.test('updated', () => pm.expect(pm.response.json().data.firstName).to.eql('Updated'));"] }),
    req('Update user (empty body)', 'PATCH', '/api/v1/users/{{userId}}', { body: {}, tests: [status(400)] }),
    req('Reset password', 'POST', '/api/v1/users/{{userId}}/reset-password', { body: { newPassword: 'Br4nd!NewPassw0rd' }, tests: [status(204)] }),
    req('Login as the new user', 'POST', '/api/v1/auth/login', {
      token: null, body: { username: '{{newUser}}', password: 'Br4nd!NewPassw0rd' },
      tests: [status(200), "pm.collectionVariables.set('userToken', pm.response.json().data.accessToken);"] }),
    req('As new manager: list users (200)', 'GET', '/api/v1/users?limit=1', { token: 'userToken', tests: [status(200)] }),
    req('As new manager: read audit log (403)', 'GET', '/api/v1/audit-logs', { token: 'userToken', tests: [status(403), errCode('FORBIDDEN')] }),
    req('As new manager: delete user (403)', 'DELETE', '/api/v1/users/{{userId}}', { token: 'userToken', tests: [status(403)] }),
    req('Delete user', 'DELETE', '/api/v1/users/{{userId}}', { tests: [status(204)] }),
    req('Get deleted user', 'GET', '/api/v1/users/{{userId}}', { tests: [status(404), errCode('USER_NOT_FOUND')] }),
    req("Deleted user's token is dead", 'GET', '/api/v1/auth/me', { token: 'userToken', tests: [status(401)] }),
  ] },
  { name: '3. Roles & audit', item: [
    req('List roles', 'GET', '/api/v1/roles', {
      tests: [status(200), "pm.test('has admin', () => pm.expect(pm.response.json().data.map(r => r.name)).to.include('admin'));"] }),
    req('Audit: filter by action', 'GET', '/api/v1/audit-logs?action=USER_CREATED&limit=5', {
      tests: [status(200), "pm.test('only USER_CREATED', () => pm.response.json().data.forEach(e => pm.expect(e.action).to.eql('USER_CREATED')));"] }),
    req('Audit: history of the deleted user', 'GET', '/api/v1/audit-logs?entityType=user&entityId={{userId}}', {
      tests: [status(200), 'const actions = pm.response.json().data.map(e => e.action);',
        "pm.test('lifecycle recorded', () => ['USER_CREATED', 'USER_UPDATED', 'PASSWORD_RESET', 'USER_DELETED'].forEach(a => pm.expect(actions).to.include(a)));"] }),
  ] },
  { name: '4. Logout', item: [
    req('Logout', 'POST', '/api/v1/auth/logout', { tests: [status(204)] }),
    req('Token revoked after logout', 'GET', '/api/v1/auth/me', { tests: [status(401), errCode('TOKEN_REVOKED')] }),
  ] },
];

mkdirSync(new URL('../postman/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  info: {
    name: 'User Management API',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Run folders in order with the Collection Runner. Needs an existing admin (see variables).',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' }, { key: 'adminUser', value: 'admin' },
    { key: 'adminPassword', value: 'Admin!Passw0rd' }, { key: 'token', value: '' }, { key: 'userToken', value: '' },
    { key: 'badToken', value: 'not.a.jwt' }, { key: 'userId', value: '' },
  ],
  item: folders,
}, null, 2));
console.log('wrote', OUT.pathname);
