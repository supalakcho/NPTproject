// N1–N8 โน๊ตบุ๊ค
import { notebooks } from '../services/index.js';
import { handle } from './respond.js';

export const list = handle((ctx, req) => notebooks.list(ctx, req.query));
export const available = handle((ctx, req) => notebooks.searchAvailable(ctx, req.query));
export const byAssetCode = handle((ctx, req) => notebooks.getByAssetCode(ctx, req.params.assetCode));
export const getById = handle((ctx, req) => notebooks.getById(ctx, req.params.id));
export const create = handle((ctx, req) => notebooks.create(ctx, req.body), { status: 201 });
export const update = handle((ctx, req) => notebooks.update(ctx, req.params.id, req.body));
export const remove = handle((ctx, req) => notebooks.delete(ctx, req.params.id));
export const restore = handle((ctx, req) => notebooks.restore(ctx, req.params.id));
