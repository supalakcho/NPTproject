// งานสร้างแจ้งเตือน (scheduler เรียกทุก 5 นาที, test เรียกตรงได้)
// รันซ้ำได้ปลอดภัย: model ใช้ insertIfNotExists และหาเฉพาะรายการที่ยังไม่เคยแจ้ง
// การหมดอายุของการจองไม่ต้องใช้ job เพราะ model คำนวณสถานะจาก SQL ทุกครั้งที่อ่าน
import { loans, reservations, notifications } from '../models/index.js';
import { getSettings } from '../services/core/settingsCache.js';
import { logger } from '../services/core/logger.js';

let isRunning = false;

async function each(items, toNotification, summary, key) {
  for (const item of items) {
    try {
      if (await notifications.insertIfNotExists(toNotification(item))) summary[key] += 1;
    } catch (err) {
      summary.failed += 1;
      logger.error('notification job item failed', err, { key, id: item.id });
    }
  }
}

/**
 * @returns {Promise<{ dueSoon: number, overdue: number, reservationSoon: number, failed: number, durationMs: number }|null>}
 *   null = รอบก่อนยังไม่จบ ข้ามรอบนี้
 */
export async function runNotificationJob() {
  if (isRunning) return null;
  isRunning = true;
  const started = Date.now();
  const summary = { dueSoon: 0, overdue: 0, reservationSoon: 0, failed: 0, durationMs: 0 };
  try {
    // ใช้ reminderBeforeMinutes ทั้งแจ้งเตือนคืนและแจ้งเตือนการจอง
    const { reminderBeforeMinutes } = await getSettings();
    await each(await loans.findDueSoon(reminderBeforeMinutes), (l) => ({ type: 'loan_due_soon', loanId: l.id, refDueAt: l.dueAt }), summary, 'dueSoon');
    await each(await loans.findOverdueWithoutNotice(), (l) => ({ type: 'loan_overdue', loanId: l.id, refDueAt: l.dueAt }), summary, 'overdue');
    await each(
      await reservations.findStartingSoon(reminderBeforeMinutes),
      (r) => ({ type: 'reservation_starting', reservationId: r.id }),
      summary,
      'reservationSoon',
    );
  } catch (err) {
    summary.failed += 1;
    logger.error('notification job failed', err);
  } finally {
    summary.durationMs = Date.now() - started;
    isRunning = false;
  }
  logger.info('notification job done', summary);
  return summary;
}
