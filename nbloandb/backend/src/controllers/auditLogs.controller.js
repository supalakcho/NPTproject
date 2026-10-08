// G1–G2 Audit Log
import { auditLogs } from '../services/index.js';
import { handle } from './respond.js';

export const list = handle((ctx, req) => auditLogs.list(ctx, req.query));
export const getById = handle((ctx, req) => auditLogs.getById(ctx, req.params.id));
