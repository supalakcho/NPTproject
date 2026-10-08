import { closePool, memberCtx, createNotebook, insertLoan, insertReservation, code, HOUR, MINUTE } from '../helpers/serviceEnv.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loans, notifications } from '../../src/services/index.js';
import { runNotificationJob } from '../../src/jobs/notification.job.js';

after(closePool);

const types = async (ctx) => (await notifications.listMine(ctx)).rows.map((n) => n.type).sort();

test('job: สร้าง loan_due_soon / loan_overdue / reservation_starting และรัน 2 รอบติดกันไม่สร้างซ้ำ', async () => {
  const { user, ctx } = await memberCtx();
  await insertLoan(user, await createNotebook(), -HOUR, 30 * MINUTE); // ครบกำหนดภายใน 60 นาที
  const other = await memberCtx();
  await insertLoan(other.user, await createNotebook(), -3 * HOUR, -HOUR); // เกินกำหนด
  await insertReservation(user, await createNotebook(), 40 * MINUTE, 2 * HOUR); // เริ่มภายใน 60 นาที

  const first = await runNotificationJob();
  assert.ok(first.dueSoon >= 1 && first.overdue >= 1 && first.reservationSoon >= 1);
  assert.equal(first.failed, 0);
  assert.deepEqual(await types(ctx), ['loan_due_soon', 'reservation_starting']);
  assert.deepEqual(await types(other.ctx), ['loan_overdue']);

  // ไฟล์ test อื่นอาจสร้างการยืมพร้อมกัน จึงตรวจเฉพาะแจ้งเตือนของผู้ใช้ใน test นี้
  const second = await runNotificationJob();
  assert.equal(second.failed, 0);
  assert.deepEqual(await types(ctx), ['loan_due_soon', 'reservation_starting']);
  assert.deepEqual(await types(other.ctx), ['loan_overdue']);
  assert.equal((await notifications.countUnread(ctx)).count, 2);
});

test('job: ต่อเวลาแล้วได้ loan_due_soon ใหม่ตาม dueAt ใหม่', async () => {
  const { ctx } = await memberCtx();
  const loan = await loans.borrowNow(ctx, { notebookId: (await createNotebook()).id, dueAt: new Date(Date.now() + 30 * MINUTE).toISOString() });
  await runNotificationJob();
  assert.deepEqual(await types(ctx), ['loan_due_soon']);
  await loans.extend(ctx, loan.id, { newDueAt: new Date(loan.dueAt.getTime() + 20 * MINUTE).toISOString() });
  await runNotificationJob();
  assert.deepEqual(await types(ctx), ['loan_due_soon', 'loan_due_soon']);
});

test('listMine: มี title/message ภาษาไทย · markRead / markAllRead / unreadOnly · ของคนอื่น = 404', async () => {
  const { user, ctx } = await memberCtx();
  const nb = await createNotebook();
  await insertLoan(user, nb, -3 * HOUR, -HOUR);
  await insertReservation(user, await createNotebook(), 30 * MINUTE, HOUR);
  await runNotificationJob();

  const { rows, total } = await notifications.listMine(ctx);
  assert.equal(total, 2);
  const overdue = rows.find((n) => n.type === 'loan_overdue');
  assert.equal(overdue.title, 'เกินกำหนดคืน');
  assert.ok(overdue.message.includes(nb.assetCode));
  assert.ok(rows.find((n) => n.type === 'reservation_starting').message.includes('30 นาที'));

  const other = await memberCtx();
  await assert.rejects(notifications.markRead(other.ctx, overdue.id), code('NOTIFICATION_NOT_FOUND'));
  assert.equal(await notifications.markRead(ctx, overdue.id), null);
  assert.equal((await notifications.listMine(ctx, { unreadOnly: 'true' })).total, 1);
  assert.deepEqual(await notifications.markAllRead(ctx), { updated: 1 });
  assert.deepEqual(await notifications.countUnread(ctx), { count: 0 });
});
