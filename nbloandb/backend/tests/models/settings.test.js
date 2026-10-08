import { closePool, rollbackTest } from '../helpers/testDb.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { settings, execute } from '../../src/models/index.js';

after(closePool);

test('getAll คืน key camelCase และค่าเป็น Number', rollbackTest(async (conn) => {
  assert.deepEqual(await settings.getAll({ conn }), {
    maxActiveLoansPerUser: 1,
    maxLoanHours: 24,
    reminderBeforeMinutes: 60,
    reservationGraceMinutes: 30,
    reservationMaxDaysAhead: 7,
  });
}));

test('get คืนค่าที่แปลงชนิดแล้ว หรือ null ถ้าไม่มี key', rollbackTest(async (conn) => {
  assert.equal(await settings.get('maxLoanHours', { conn }), 24);
  assert.equal(await settings.get('noSuchKey', { conn }), null);
}));

test('listDetailed มีรายละเอียดครบ', rollbackTest(async (conn) => {
  const rows = await settings.listDetailed({ conn });
  assert.equal(rows.length, 5);
  const row = rows.find((r) => r.key === 'maxLoanHours');
  assert.equal(row.value, 24);
  assert.equal(row.valueType, 'int');
  assert.equal(typeof row.description, 'string');
  assert.ok(row.updatedAt instanceof Date);
}));

test('set แก้ค่าและ updatedBy, key ที่ไม่มีคืน null (ไม่สร้างใหม่)', rollbackTest(async (conn) => {
  const updated = await settings.set('reminderBeforeMinutes', 45, { updatedBy: 1 }, { conn });
  assert.equal(updated.value, 45);
  assert.equal(updated.updatedBy, 1);
  assert.equal(await settings.get('reminderBeforeMinutes', { conn }), 45);
  assert.equal(await settings.set('brandNewKey', 1, { updatedBy: 1 }, { conn }), null);
  assert.equal(await settings.get('brandNewKey', { conn }), null);
}));

test('ค่า bool และ string แปลงชนิดถูก', rollbackTest(async (conn) => {
  await execute(
    "INSERT INTO settings (setting_key, setting_value, value_type, description) VALUES ('maintenance_mode', '0', 'bool', 't'), ('site_name', 'NB Loan', 'string', 't')",
    [],
    { conn },
  );
  assert.equal(await settings.get('maintenanceMode', { conn }), false);
  assert.equal((await settings.set('maintenanceMode', true, { updatedBy: 1 }, { conn })).value, true);
  assert.equal(await settings.get('maintenanceMode', { conn }), true);
  assert.equal(await settings.get('siteName', { conn }), 'NB Loan');
}));

test('updatedBy ที่ไม่มีจริง → FK_NOT_FOUND', rollbackTest(async (conn) => {
  await assert.rejects(settings.set('maxLoanHours', 12, { updatedBy: 99999 }, { conn }), { code: 'FK_NOT_FOUND' });
}));
