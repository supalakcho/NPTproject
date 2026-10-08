// P1–P5 รายงาน
import { reports } from '../services/index.js';
import { handle } from './respond.js';

export const summary = handle((ctx) => reports.summary(ctx));
export const notebooks = handle((ctx, req) => reports.allNotebooks(ctx, req.query));
export const outstandingLoans = handle((ctx, req) => reports.outstandingLoans(ctx, req.query));
export const availableNotebooks = handle((ctx, req) => reports.availableNotebooks(ctx, req.query));
export const monthlyLoans = handle((ctx, req) => reports.monthlyLoans(ctx, req.query));
