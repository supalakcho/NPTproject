// การยืม (L) และการจอง (R) · /loans/pending-return ต้องมาก่อน /:id
import { Router } from 'express';
import * as loans from '../controllers/loans.controller.js';
import * as reservations from '../controllers/reservations.controller.js';

export const loanRoutes = Router()
  .post('/', loans.borrow) // L1
  .get('/', loans.list) // L5
  .get('/pending-return', loans.pendingReturn) // L6
  .get('/:id', loans.getById) // L2
  .post('/:id/extend', loans.extend) // L3
  .post('/:id/return-request', loans.requestReturn) // L4
  .post('/:id/confirm-return', loans.confirmReturn) // L7
  .post('/:id/cancel', loans.cancel); // L8

export const reservationRoutes = Router()
  .post('/', reservations.create) // R1
  .get('/', reservations.list) // R5
  .get('/:id', reservations.getById) // R2
  .post('/:id/pickup', reservations.pickup) // R3
  .post('/:id/cancel', reservations.cancel); // R4
