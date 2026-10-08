// U1–U7 สมาชิก (แอดมิน)
import { users } from '../services/index.js';
import { handle } from './respond.js';

export const list = handle((ctx, req) => users.list(ctx, req.query));
export const getById = handle((ctx, req) => users.getById(ctx, req.params.id));
export const update = handle((ctx, req) => users.update(ctx, req.params.id, req.body));
export const suspend = handle((ctx, req) => users.suspend(ctx, req.params.id));
export const activate = handle((ctx, req) => users.activate(ctx, req.params.id));
export const remove = handle((ctx, req) => users.delete(ctx, req.params.id));
export const restore = handle((ctx, req) => users.restore(ctx, req.params.id));
