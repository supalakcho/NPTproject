import { closePool, unique, memberCtx, adminCtx, createNotebook, insertLoan, lastAudit, code, fromNow, HOUR } from '../helpers/serviceEnv.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execute, query } from '../../src/models/index.js';
import { users, settings, auditLogs, reports, loans } from '../../src/services/index.js';

after(closePool);

// ทำให้ admin ที่ระบุเป็นแอดมินที่ใช้งานได้คนเดียว แล้วคืนค่าเดิมหลังจบ fn (ฐานทดสอบมีแอดมินจาก test อื่นปนอยู่)
async function asOnlyActiveAdmin(adminId, fn) {
  const rows = await query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' AND u.is_active = 1 AND u.id <> ?", [adminId]);
  const ids = rows.map((r) => r.id);
  if (ids.length) await execute(`UPDATE users SET is_active = 0 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  try {
    await fn();
  } finally {
    if (ids.length) await execute(`UPDATE users SET is_active = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }
}

test('users: list/getById (activeLoanCount) เห็นข้อมูลแอดมิน · สมาชิกเรียกไม่ได้', async () => {
  const admin = await adminCtx();
  const m = await memberCtx({ firstName: unique('ค้นหา') });
  await insertLoan(m.user, await createNotebook(), -HOUR, HOUR);
  const page = await users.list(admin.ctx, { keyword: m.user.firstName });
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].roleId, m.user.roleId);
  assert.ok(!JSON.stringify(page.rows[0]).toLowerCase().includes('password'));
  assert.equal((await users.getById(admin.ctx, m.user.id)).activeLoanCount, 1);
  await assert.rejects(users.getById(admin.ctx, 999999), code('USER_NOT_FOUND'));
  await assert.rejects(users.list(m.ctx), code('FORBIDDEN'));
});

test('users.update: แก้ข้อมูล + audit, อีเมล/รหัสสมาชิกซ้ำ, role ไม่มีจริง', async () => {
  const admin = await adminCtx();
  const a = await memberCtx({ memberCode: unique('MC') });
  const b = await memberCtx();
  const updated = await users.update(admin.ctx, b.user.id, { phone: '0811111111', email: `${unique('new')}@x.local` });
  assert.equal(updated.phone, '0811111111');
  assert.deepEqual(Object.keys((await lastAudit({ targetTable: 'users', targetId: b.user.id })).newValues).sort(), ['email', 'phone']);
  await assert.rejects(users.update(admin.ctx, b.user.id, { email: a.user.email }), code('EMAIL_TAKEN'));
  await assert.rejects(users.update(admin.ctx, b.user.id, { memberCode: a.user.memberCode }), code('MEMBER_CODE_TAKEN'));
  await assert.rejects(users.update(admin.ctx, b.user.id, { roleId: 999 }), code('VALIDATION_ERROR'));
  await assert.rejects(users.update(admin.ctx, 999999, { phone: '0811111111' }), code('USER_NOT_FOUND'));
});

test('users.suspend/activate: ระงับแล้วสมาชิกยังกดคืนได้ · ระงับตัวเอง = CANNOT_MODIFY_SELF', async () => {
  const admin = await adminCtx();
  const m = await memberCtx();
  const loan = await insertLoan(m.user, await createNotebook(), -HOUR, HOUR);
  const suspended = await users.suspend(admin.ctx, m.user.id);
  assert.equal(suspended.isActive, false);
  assert.equal((await lastAudit({ targetTable: 'users', targetId: m.user.id })).newValues.event, 'suspend');
  assert.equal((await loans.requestReturn(m.ctx, loan.id)).loanStatus, 'return_pending'); // การยืมค้างยังคืนได้
  assert.equal((await users.activate(admin.ctx, m.user.id)).isActive, true);
  await assert.rejects(users.suspend(admin.ctx, admin.user.id), code('CANNOT_MODIFY_SELF'));
});

test('แอดมินคนสุดท้าย: ระงับ/ลบ/เปลี่ยน role ไม่ได้ = LAST_ADMIN', async () => {
  const admin = await adminCtx();
  const last = await adminCtx();
  const memberRoleId = (await memberCtx()).user.roleId;
  await asOnlyActiveAdmin(last.user.id, async () => {
    // admin.ctx ยังเรียกได้เพราะ ctx ใน test สร้างไว้แล้ว (ในระบบจริง admin ที่ถูกระงับจะ login ไม่ได้)
    await assert.rejects(users.suspend(admin.ctx, last.user.id), code('LAST_ADMIN'));
    await assert.rejects(users.delete(admin.ctx, last.user.id), code('LAST_ADMIN'));
    await assert.rejects(users.update(admin.ctx, last.user.id, { roleId: memberRoleId }), code('LAST_ADMIN'));
  });
  assert.equal((await users.suspend(admin.ctx, last.user.id)).isActive, false); // มีแอดมินคนอื่นแล้วทำได้
});

test('users.delete/restore: มีเครื่องค้าง = USER_HAS_ACTIVE_LOANS · ลบตัวเองไม่ได้ · ลบแล้วกู้คืนได้', async () => {
  const admin = await adminCtx();
  const busy = await memberCtx();
  await insertLoan(busy.user, await createNotebook(), -HOUR, HOUR);
  await assert.rejects(users.delete(admin.ctx, busy.user.id), code('USER_HAS_ACTIVE_LOANS'));
  await assert.rejects(users.delete(admin.ctx, admin.user.id), code('CANNOT_MODIFY_SELF'));
  const free = await memberCtx();
  assert.equal(await users.delete(admin.ctx, free.user.id), null);
  assert.ok((await users.getById(admin.ctx, free.user.id)).deletedAt instanceof Date);
  assert.equal((await users.restore(admin.ctx, free.user.id)).deletedAt, null);
  await assert.rejects(users.restore(admin.ctx, free.user.id), code('USER_NOT_FOUND'));
});

test('settings: getPublic ทุกคนที่ login · update ผิด 1 ตัวไม่บันทึกเลย · นอกช่วง/ไม่รู้จัก ถูกปฏิเสธ · audit old/new', async () => {
  const admin = await adminCtx();
  const m = await memberCtx();
  assert.deepEqual(Object.keys(await settings.getPublic(m.ctx)).sort(), [
    'maxActiveLoansPerUser', 'maxLoanHours', 'reservationGraceMinutes', 'reservationMaxDaysAhead',
  ]);
  await assert.rejects(settings.update(admin.ctx, { maxLoanHours: 25 }), code('VALIDATION_ERROR'));
  await assert.rejects(settings.update(admin.ctx, { reminderBeforeMinutes: 30, maxLoanHours: 0 }), code('VALIDATION_ERROR'));
  await assert.rejects(settings.update(admin.ctx, { foo: 1 }), code('UNKNOWN_SETTING'));
  await assert.rejects(settings.update(admin.ctx, {}), code('VALIDATION_ERROR'));
  await assert.rejects(settings.update(m.ctx, { maxLoanHours: 12 }), code('FORBIDDEN'));
  const before = await settings.listDetailed(admin.ctx);
  assert.equal(before.find((s) => s.key === 'reminderBeforeMinutes').value, 60); // ไม่ถูกบันทึกจากคำขอที่ผิด

  try {
    const after = await settings.update(admin.ctx, { reminderBeforeMinutes: '45' });
    const row = after.find((s) => s.key === 'reminderBeforeMinutes');
    assert.equal(row.value, 45);
    assert.equal(row.updatedBy, admin.user.id);
    const log = await lastAudit({ userId: admin.user.id, targetTable: 'settings' });
    assert.deepEqual([log.oldValues, log.newValues], [{ reminderBeforeMinutes: 60 }, { reminderBeforeMinutes: 45 }]);
  } finally {
    await settings.update(admin.ctx, { reminderBeforeMinutes: 60 });
  }
});

test('auditLogs: list กรองได้ + userFullName · from หลัง to ถูกปฏิเสธ · getById · สมาชิกดูไม่ได้', async () => {
  const admin = await adminCtx();
  const m = await memberCtx({ firstName: 'ผู้ตรวจ', lastName: unique('L') });
  await assert.rejects(users.list(m.ctx), code('FORBIDDEN')); // สร้าง PERMISSION_DENIED
  const page = await auditLogs.list(admin.ctx, { userId: m.user.id, action: 'PERMISSION_DENIED', from: fromNow(-HOUR).toISOString() });
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].userFullName, `ผู้ตรวจ ${m.user.lastName}`);
  assert.equal((await auditLogs.getById(admin.ctx, page.rows[0].id)).id, page.rows[0].id);
  await assert.rejects(auditLogs.getById(admin.ctx, 99999999), code('AUDIT_LOG_NOT_FOUND'));
  await assert.rejects(auditLogs.list(admin.ctx, { from: fromNow(0).toISOString(), to: fromNow(-HOUR).toISOString() }), code('VALIDATION_ERROR'));
  await assert.rejects(auditLogs.list(admin.ctx, { action: 'RESTORE' }), code('VALIDATION_ERROR'));
  await assert.rejects(auditLogs.list(m.ctx), code('FORBIDDEN'));
});

test('reports: summary, notebooks (มี serial), outstanding (เกินกำหนดก่อน), available', async () => {
  const admin = await adminCtx();
  const m = await memberCtx();
  const nb = await createNotebook();
  await insertLoan(m.user, nb, -3 * HOUR, -HOUR);
  const s = await reports.summary(admin.ctx);
  assert.equal(s.total, s.available + s.borrowed + s.reserved + s.damaged + s.maintenance + s.retired);
  const all = await reports.allNotebooks(admin.ctx, { keyword: nb.assetCode });
  assert.equal(all.rows[0].serialNumber, nb.serialNumber);
  const out = await reports.outstandingLoans(admin.ctx, { pageSize: 100 });
  assert.equal(out.rows[0].loanStatus, 'overdue');
  const avail = await reports.availableNotebooks(admin.ctx, { modelId: nb.modelId });
  assert.equal(avail.total, 0); // เครื่องเดียวของรุ่นนี้ถูกยืมอยู่
  await assert.rejects(reports.summary(m.ctx), code('FORBIDDEN'));
});

test('reports.monthlyLoans: เติมเดือนที่ไม่มีข้อมูลเป็น 0 · ตรวจรูปแบบ/ลำดับ/ช่วงไม่เกิน 24 เดือน', async () => {
  const admin = await adminCtx();
  const m = await memberCtx();
  await insertLoan(m.user, await createNotebook(), -HOUR, HOUR);
  const thisMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }).slice(0, 7);
  const rows = await reports.monthlyLoans(admin.ctx, { fromMonth: '2025-11', toMonth: '2026-02' });
  assert.deepEqual(rows, [
    { loanMonth: '2025-11', totalLoans: 0, lateLoans: 0 },
    { loanMonth: '2025-12', totalLoans: 0, lateLoans: 0 },
    { loanMonth: '2026-01', totalLoans: 0, lateLoans: 0 },
    { loanMonth: '2026-02', totalLoans: 0, lateLoans: 0 },
  ]);
  const current = await reports.monthlyLoans(admin.ctx, { fromMonth: thisMonth, toMonth: thisMonth });
  assert.ok(current[0].totalLoans >= 1);
  await assert.rejects(reports.monthlyLoans(admin.ctx, { fromMonth: '2026-05', toMonth: '2026-01' }), code('VALIDATION_ERROR'));
  await assert.rejects(reports.monthlyLoans(admin.ctx, { fromMonth: '2024-01', toMonth: '2026-02' }), code('VALIDATION_ERROR'));
  await assert.rejects(reports.monthlyLoans(admin.ctx, { fromMonth: '2026-1', toMonth: '2026-02' }), code('VALIDATION_ERROR'));
  assert.equal((await reports.monthlyLoans(admin.ctx, { fromMonth: '2024-01', toMonth: '2026-01' })).length, 25);
});
