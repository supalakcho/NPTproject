import { closePool, unique, memberCtx, lastAudit, code } from '../helpers/serviceEnv.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { brands, DbError } from '../../src/models/index.js';
import { AppError } from '../../src/services/core/AppError.js';
import { ERROR_CODES } from '../../src/services/core/errorCodes.js';
import { toAppError } from '../../src/services/core/dbErrorMapper.js';
import { requirePermission } from '../../src/services/core/authorize.js';
import { now, setNowForTest } from '../../src/services/core/clock.js';
import { logger } from '../../src/services/core/logger.js';
import { signToken, verifyToken } from '../../src/services/core/token.js';
import { hashPassword, comparePassword } from '../../src/services/core/password.js';
import { diff } from '../../src/services/core/audit.js';
import { validate, required, optional, str, int, dateTime, dateOnly, sortOf, month, PASSWORD } from '../../src/services/validators/rules.js';

after(closePool);

test('AppError: status และข้อความจาก errorCodes, แทน {n} ด้วย params, code ไม่รู้จัก throw', () => {
  const err = new AppError('RESERVATION_TOO_FAR_AHEAD', { params: { n: 7 } });
  assert.equal(err.status, 400);
  assert.equal(err.message, 'จองล่วงหน้าได้ไม่เกิน 7 วัน');
  assert.equal(new AppError('LOAN_LIMIT_REACHED').status, 422);
  assert.throws(() => new AppError('NO_SUCH_CODE'));
  for (const [key, def] of Object.entries(ERROR_CODES)) {
    assert.ok([400, 401, 403, 404, 409, 422, 500].includes(def.status), key);
  }
});

test('toAppError: DbError แปลงตามชื่อ constraint ใน SQL ทุกตัว', () => {
  const cases = [
    ['DUPLICATE', 'uq_users_email', 'EMAIL_TAKEN'],
    ['DUPLICATE', 'uq_users_member_code', 'MEMBER_CODE_TAKEN'],
    ['DUPLICATE', 'uq_brands_name', 'BRAND_NAME_TAKEN'],
    ['DUPLICATE', 'uq_models_brand_name', 'MODEL_NAME_TAKEN'],
    ['DUPLICATE', 'uq_notebooks_asset_code', 'ASSET_CODE_TAKEN'],
    ['DUPLICATE', 'uq_notebooks_serial', 'SERIAL_NUMBER_TAKEN'],
    ['DUPLICATE', 'uq_loans_active_notebook', 'NOTEBOOK_ALREADY_BORROWED'],
    ['CHECK_FAILED', 'chk_loans_due', 'LOAN_DURATION_EXCEEDED'],
    ['CHECK_FAILED', 'chk_res_period', 'INVALID_TIME_RANGE'],
    ['FK_NOT_FOUND', 'fk_users_role', 'REFERENCE_NOT_FOUND'],
    ['FK_IN_USE', 'fk_loans_user', 'RESOURCE_IN_USE'],
    ['INVALID_COLUMN', null, 'INTERNAL_ERROR'],
    ['DB_ERROR', null, 'INTERNAL_ERROR'],
  ];
  for (const [dbCode, constraint, expected] of cases) {
    const mapped = toAppError(new DbError(dbCode, 'raw sql message', { constraint, cause: new Error('secret') }));
    assert.equal(mapped.code, expected, `${dbCode} ${constraint}`);
    assert.ok(!mapped.message.includes('raw sql'), 'ไม่ส่งข้อความของ DB ให้ผู้ใช้');
    assert.equal(mapped.cause, undefined);
  }
  const same = new AppError('FORBIDDEN');
  assert.equal(toAppError(same), same);
  assert.equal(toAppError(new TypeError('boom')).code, 'INTERNAL_ERROR');
});

test('toAppError: error จริงจาก DB (ชื่อยี่ห้อซ้ำ) → BRAND_NAME_TAKEN', async () => {
  const name = unique('Dup');
  await brands.insert({ name });
  await assert.rejects(brands.insert({ name }).catch((e) => Promise.reject(toAppError(e))), code('BRAND_NAME_TAKEN'));
});

test('requirePermission: มีสิทธิ์ผ่าน · ไม่มีสิทธิ์ได้ FORBIDDEN + audit PERMISSION_DENIED · ไม่ login ได้ UNAUTHORIZED', async () => {
  const { user, ctx } = await memberCtx();
  await requirePermission(ctx, 'loan.create');
  await assert.rejects(requirePermission(ctx, 'setting.manage'), code('FORBIDDEN'));
  const log = await lastAudit({ userId: user.id, action: 'PERMISSION_DENIED' });
  assert.equal(log.newValues.permission, 'setting.manage');
  assert.equal(log.ipAddress, '127.0.0.1');
  await assert.rejects(requirePermission({ ip: '1.1.1.1' }, 'loan.create'), code('UNAUTHORIZED'));
});

test('clock: เลื่อนเวลาได้ใน test และตัดมิลลิวินาที', () => {
  setNowForTest(new Date('2026-01-01T10:00:00.789+07:00'));
  assert.equal(now().toISOString(), '2026-01-01T03:00:00.000Z');
  setNowForTest(null);
  assert.ok(Math.abs(now() - Date.now()) < 2000);
  assert.equal(now().getMilliseconds(), 0);
});

test('logger: เขียนไฟล์ app-YYYY-MM-DD.log เป็น JSON', () => {
  const marker = unique('log');
  logger.warn('test warn', { marker });
  const dir = process.env.LOG_DIR;
  const files = fs.readdirSync(dir).filter((f) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(f));
  const content = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  const line = content.split('\n').find((l) => l.includes(marker));
  assert.equal(JSON.parse(line).level, 'warn');
});

test('token: sign/verify และ token ปลอมได้ null · password: hash/compare (รองรับ hash $2b$ จาก seed)', async () => {
  const { token, expiresAt } = signToken({ userId: 5, roleId: 2, roleCode: 'member' });
  assert.deepEqual(verifyToken(token), { userId: 5 });
  assert.ok(expiresAt > new Date());
  assert.equal(verifyToken(token + 'x'), null);
  assert.equal(verifyToken('garbage'), null);

  const hash = await hashPassword('Passw0rd');
  assert.equal(await comparePassword('Passw0rd', hash), true);
  assert.equal(await comparePassword('wrong', hash), false);
  const seedHash = '$2b$10$qyuvmnqdMEtCRvwlmpd4aefuMvZ3nc7/H3vjXtt9msyMuRkEVX3cO'; // Member@1234 ใน notebook_loan.sql
  assert.equal(await comparePassword('Member@1234', seedHash), true);
});

test('validate: รวม error ทุก field, optional (undefined ข้าม / null ล้างค่า), แปลงชนิดและ trim', () => {
  const schema = { name: [required, str({ max: 5 })], age: [optional, int({ min: 1 })], note: [optional, str()] };
  assert.deepEqual(validate({ name: '  abc ', age: '12', note: null }, schema), { name: 'abc', age: 12, note: null });
  assert.deepEqual(validate({ name: 'a' }, schema), { name: 'a' });
  try {
    validate({ name: 'toolong', age: 0 }, schema);
    assert.fail('ควร throw');
  } catch (err) {
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.deepEqual(err.details.map((d) => d.field), ['name', 'age']);
  }
  assert.throws(() => validate({}, schema), code('VALIDATION_ERROR'));
});

test('validate: วันเวลา ISO (ไม่มี offset = เวลาไทย), วันที่ไม่มีจริง, sort, เดือน, นโยบายรหัสผ่าน', () => {
  const v = (value, rules) => validate({ x: value }, { x: rules }).x;
  assert.equal(v('2026-10-08T14:30:00+07:00', [dateTime]).toISOString(), '2026-10-08T07:30:00.000Z');
  assert.equal(v('2026-10-08T14:30', [dateTime]).toISOString(), '2026-10-08T07:30:00.000Z');
  assert.equal(v('2026-10-08T07:30:00Z', [dateTime]).toISOString(), '2026-10-08T07:30:00.000Z');
  assert.throws(() => v('08/10/2026', [dateTime]), code('VALIDATION_ERROR'));
  assert.equal(v('2026-02-28', [dateOnly]).toISOString(), '2026-02-27T17:00:00.000Z');
  assert.throws(() => v('2026-02-30', [dateOnly]), code('VALIDATION_ERROR'));
  assert.equal(v('dueAt:desc', [sortOf(['dueAt'])]), 'dueAt:desc');
  assert.equal(v('dueAt', [sortOf(['dueAt'])]), 'dueAt:asc');
  assert.throws(() => v('password:asc', [sortOf(['dueAt'])]), code('VALIDATION_ERROR'));
  assert.throws(() => v('2026-13', [month]), code('VALIDATION_ERROR'));
  assert.equal(v('Passw0rd', PASSWORD), 'Passw0rd');
  for (const bad of ['short1', 'onlyletters', '12345678']) assert.throws(() => v(bad, PASSWORD), code('VALIDATION_ERROR'), bad);
});

test('diff: คืนเฉพาะ field ที่เปลี่ยน (Date เทียบด้วยเวลา)', () => {
  const d = new Date('2026-01-01T00:00:00Z');
  assert.deepEqual(diff({ a: 1, b: d, c: 'x' }, { a: 2, b: new Date(d), c: 'x' }, ['a', 'b', 'c']), {
    oldValues: { a: 1 },
    newValues: { a: 2 },
  });
});
