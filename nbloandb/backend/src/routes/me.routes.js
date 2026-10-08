import { Router } from 'express';
import * as c from '../controllers/me.controller.js';
import { uploadImage } from '../middlewares/upload.js';

const router = Router();
router.get('/', c.getMe); // M1
router.patch('/', c.updateMe); // M2
router.post('/avatar', uploadImage('avatars'), c.uploadAvatar); // M3
router.put('/password', c.changePassword); // M4
router.get('/loans', c.myLoans); // M5
router.get('/reservations', c.myReservations); // M6
router.get('/notifications', c.myNotifications); // M7
router.get('/notifications/unread-count', c.unreadCount); // M8
router.patch('/notifications/read-all', c.markAllRead); // M10 (ก่อน /:id)
router.patch('/notifications/:id/read', c.markRead); // M9
export default router;
