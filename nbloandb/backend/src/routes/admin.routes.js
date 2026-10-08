// ค่าตั้งค่า (S), สมาชิก (U), รายงาน (P), Audit Log (G)
import { Router } from 'express';
import * as settings from '../controllers/settings.controller.js';
import * as users from '../controllers/users.controller.js';
import * as reports from '../controllers/reports.controller.js';
import * as auditLogs from '../controllers/auditLogs.controller.js';

export const settingRoutes = Router()
  .get('/public', settings.getPublic) // S1
  .get('/', settings.list) // S2
  .patch('/', settings.update); // S3

export const userRoutes = Router()
  .get('/', users.list) // U1
  .get('/:id', users.getById) // U2
  .patch('/:id', users.update) // U3
  .post('/:id/suspend', users.suspend) // U4
  .post('/:id/activate', users.activate) // U5
  .delete('/:id', users.remove) // U6
  .post('/:id/restore', users.restore); // U7

export const reportRoutes = Router()
  .get('/summary', reports.summary) // P1
  .get('/notebooks', reports.notebooks) // P2
  .get('/outstanding-loans', reports.outstandingLoans) // P3
  .get('/available-notebooks', reports.availableNotebooks) // P4
  .get('/monthly-loans', reports.monthlyLoans); // P5

export const auditLogRoutes = Router()
  .get('/', auditLogs.list) // G1
  .get('/:id', auditLogs.getById); // G2
