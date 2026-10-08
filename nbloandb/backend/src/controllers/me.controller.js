// M1–M10 ข้อมูลของฉัน
import { profile, loans, reservations, notifications } from '../services/index.js';
import { discardUpload } from '../middlewares/upload.js';
import { handle } from './respond.js';

export const getMe = handle((ctx) => profile.getMe(ctx));
export const updateMe = handle((ctx, req) => {
  const { firstName, lastName, phone } = req.body ?? {}; // รูปโปรไฟล์เปลี่ยนผ่าน M3 เท่านั้น
  return profile.updateMe(ctx, { firstName, lastName, phone });
});
export const uploadAvatar = handle((ctx, req) =>
  profile.updateMe(ctx, { avatarPath: req.uploadPath }).catch((err) => {
    discardUpload(req);
    throw err;
  }),
);
export const changePassword = handle((ctx, req) => profile.changePassword(ctx, req.body));
export const myLoans = handle((ctx, req) => loans.listMine(ctx, req.query));
export const myReservations = handle((ctx, req) => reservations.listMine(ctx, req.query));
export const myNotifications = handle((ctx, req) => notifications.listMine(ctx, req.query));
export const unreadCount = handle((ctx) => notifications.countUnread(ctx));
export const markRead = handle((ctx, req) => notifications.markRead(ctx, req.params.id));
export const markAllRead = handle((ctx) => notifications.markAllRead(ctx));
