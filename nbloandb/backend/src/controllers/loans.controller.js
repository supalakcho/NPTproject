// L1–L8 การยืม
import { loans } from '../services/index.js';
import { handle } from './respond.js';

export const borrow = handle((ctx, req) => loans.borrowNow(ctx, req.body), { status: 201 });
export const getById = handle((ctx, req) => loans.getById(ctx, req.params.id));
export const extend = handle((ctx, req) => loans.extend(ctx, req.params.id, req.body));
export const requestReturn = handle((ctx, req) => loans.requestReturn(ctx, req.params.id));
export const list = handle((ctx, req) => loans.listAll(ctx, req.query));
export const pendingReturn = handle((ctx, req) => loans.listPendingReturn(ctx, req.query));
export const confirmReturn = handle((ctx, req) => loans.confirmReturn(ctx, req.params.id, req.body));
export const cancel = handle((ctx, req) => loans.cancel(ctx, req.params.id, req.body));
