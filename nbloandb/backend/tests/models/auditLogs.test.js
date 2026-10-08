import { closePool, rollbackTest, fromNow, HOUR } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { auditLogs, query } from '../../src/models/index.js';
import { createUser } from '../helpers/fixtures.js';

after(closePool);

test('insert คืน id และ findById อ่าน JSON กลับเป็น object', rollbackTest(async (conn) => {
  const id = await auditLogs.insert(
    {
      userId: 1, action: 'UPDATE', targetTable: 'loans', targetId: 7,
      oldValues: { dueAt: '2026-10-08T10:00:00.000Z' }, newValues: { dueAt: '2026-10-08T12:00:00.000Z', note: 'ต่อเวลา' },
      ipAddress: '::1', userAgent: 'node-test',
    },
    { conn },
  );
  assert.equal(typeof id, 'number');
  const log = await auditLogs.findById(id, { conn });
  assert.deepEqual(log.oldValues, { dueAt: '2026-10-08T10:00:00.000Z' });
  assert.deepEqual(log.newValues, { dueAt: '2026-10-08T12:00:00.000Z', note: 'ต่อเวลา' });
  assert.equal(log.action, 'UPDATE');
  assert.equal(log.userAgent, 'node-test');
  assert.ok(log.createdAt instanceof Date);
  assert.equal(await auditLogs.findById(999999999, { conn }), null);
}));

test('ลบ password / passwordHash ออกจาก old/newValues ทุกชั้นก่อนบันทึก', rollbackTest(async (conn) => {
  const id = await auditLogs.insert(
    {
      action: 'REGISTER', ipAddress: '127.0.0.1',
      oldValues: { passwordHash: 'x', email: 'a@b.c' },
      newValues: { password: 'secret', profile: { password_hash: 'y', name: 'A' } },
    },
    { conn },
  );
  const [raw] = await query('SELECT old_values, new_values FROM audit_logs WHERE id = ?', [id], { conn });
  assert.ok(!/secret|password/i.test(raw.old_values + raw.new_values), 'ไม่มีรหัสผ่านใน DB');
  const log = await auditLogs.findById(id, { conn });
  assert.deepEqual(log.oldValues, { email: 'a@b.c' });
  assert.deepEqual(log.newValues, { profile: { name: 'A' } });
}));

test('ไม่ส่ง old/newValues และ userId (เช่น login ไม่สำเร็จ) ได้ค่า null', rollbackTest(async (conn) => {
  const log = await auditLogs.findById(await auditLogs.insert({ action: 'LOGIN_FAILED', ipAddress: '10.0.0.1' }, { conn }), { conn });
  assert.equal(log.userId, null);
  assert.equal(log.oldValues, null);
  assert.equal(log.newValues, null);
}));

test('list ใหม่สุดก่อน กรอง userId/action/targetTable/targetId/from/to และแบ่งหน้า', rollbackTest(async (conn) => {
  const user = await createUser(conn);
  const ids = [];
  for (const action of ['CREATE', 'UPDATE', 'UPDATE']) {
    ids.push(await auditLogs.insert({ userId: user.id, action, targetTable: 'notebooks', targetId: 42, ipAddress: '::1' }, { conn }));
  }
  const all = await auditLogs.list({ userId: user.id }, { conn });
  assert.equal(all.total, 3);
  assert.deepEqual(all.rows.map((l) => l.id), [...ids].reverse());
  assert.equal((await auditLogs.list({ userId: user.id, action: 'UPDATE' }, { conn })).total, 2);
  assert.equal((await auditLogs.list({ targetTable: 'notebooks', targetId: 42, userId: user.id }, { conn })).total, 3);
  assert.equal((await auditLogs.list({ userId: user.id, from: fromNow(-HOUR), to: fromNow(HOUR) }, { conn })).total, 3);
  assert.equal((await auditLogs.list({ userId: user.id, from: fromNow(HOUR) }, { conn })).total, 0);
  const page = await auditLogs.list({ userId: user.id, page: 2, pageSize: 2 }, { conn });
  assert.deepEqual(page.rows.map((l) => l.id), [ids[0]]);
}));

test('error: action ไม่อยู่ใน enum → DbError, userId ไม่มีจริง → FK_NOT_FOUND', rollbackTest(async (conn) => {
  await assert.rejects(auditLogs.insert({ action: 'HACK', ipAddress: '::1' }, { conn }), { name: 'DbError' });
  await assert.rejects(auditLogs.insert({ action: 'LOGOUT', userId: 999999, ipAddress: '::1' }, { conn }), { code: 'FK_NOT_FOUND' });
}));

test('append-only: model ไม่มี update / delete', () => {
  assert.equal(auditLogs.update, undefined);
  assert.equal(auditLogs.hardDelete, undefined);
  assert.equal(auditLogs.softDelete, undefined);
});
