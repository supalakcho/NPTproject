// แจ้งเตือนของฉัน (สร้างโดย scheduled job และตอนแอดมินยกเลิก)
import { notifications, reservations } from '../models/index.js';
import { AppError } from './core/AppError.js';
import { requireLogin } from './core/authorize.js';
import { notificationText } from './core/notificationText.js';
import { getSettings } from './core/settingsCache.js';
import { validate, optional, bool, paging, id as idRule, PAGING } from './validators/rules.js';

const LIST = { unreadOnly: [optional, bool], ...PAGING };

/**
 * ใหม่สุดก่อน เติม title/message ภาษาไทยตาม type
 * @param {import('./core/context.js').Ctx} ctx
 * @param {{ unreadOnly?: boolean, page?: number, pageSize?: number }} filter
 */
export async function listMine(ctx, filter = {}) {
  requireLogin(ctx);
  const { unreadOnly, page, pageSize } = paging(validate(filter, LIST));
  const result = await notifications.listByUser(ctx.userId, { unreadOnly: Boolean(unreadOnly), page, pageSize });
  const { reservationGraceMinutes } = await getSettings();
  const rows = [];
  for (const n of result.rows) {
    // ponytail: query ต่อรายการเฉพาะ reservation_starting (ไม่เกิน pageSize) ถ้าช้าค่อย join ใน model
    const extra = n.type === 'reservation_starting'
      ? { startAt: (await reservations.findById(n.reservationId))?.startAt, grace: reservationGraceMinutes }
      : {};
    rows.push({
      id: n.id,
      type: n.type,
      ...notificationText(n, extra),
      loanId: n.loanId,
      reservationId: n.reservationId,
      isRead: n.isRead,
      createdAt: n.createdAt,
    });
  }
  return { ...result, rows };
}

/** @returns {Promise<{ count: number }>} */
export async function countUnread(ctx) {
  requireLogin(ctx);
  return { count: await notifications.countUnreadByUser(ctx.userId) };
}

/** อ่านได้เฉพาะของตัวเอง ของคนอื่น = NOTIFICATION_NOT_FOUND */
export async function markRead(ctx, id) {
  requireLogin(ctx);
  const notificationId = validate({ id }, { id: [idRule] }).id;
  if (!(await notifications.markRead(notificationId, ctx.userId))) throw new AppError('NOTIFICATION_NOT_FOUND');
  return null;
}

/** @returns {Promise<{ updated: number }>} */
export async function markAllRead(ctx) {
  requireLogin(ctx);
  return { updated: await notifications.markAllRead(ctx.userId) };
}
