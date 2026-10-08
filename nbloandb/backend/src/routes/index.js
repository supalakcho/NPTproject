// รวม route ทั้งหมดใต้ /api/v1 · ทุก route หลัง /auth ต้อง login (สิทธิ์ละเอียดตรวจใน service)
import { Router } from 'express';
import { requireAuth } from '../middlewares/authenticate.js';
import authRoutes from './auth.routes.js';
import meRoutes from './me.routes.js';
import { brandRoutes, modelRoutes, notebookRoutes } from './catalog.routes.js';
import { loanRoutes, reservationRoutes } from './transaction.routes.js';
import { settingRoutes, userRoutes, reportRoutes, auditLogRoutes } from './admin.routes.js';

const router = Router();
router.use('/auth', authRoutes);
router.use(requireAuth);
router.use('/me', meRoutes);
router.use('/settings', settingRoutes);
router.use('/brands', brandRoutes);
router.use('/notebook-models', modelRoutes);
router.use('/notebooks', notebookRoutes);
router.use('/loans', loanRoutes);
router.use('/reservations', reservationRoutes);
router.use('/users', userRoutes);
router.use('/reports', reportRoutes);
router.use('/audit-logs', auditLogRoutes);
export default router;
