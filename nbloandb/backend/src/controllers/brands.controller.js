// B1–B6 ยี่ห้อ
import { brands } from '../services/index.js';
import { handle } from './respond.js';

export const options = handle((ctx) => brands.listBrandOptions(ctx));
export const list = handle((ctx, req) => brands.listBrands(ctx, req.query));
export const create = handle((ctx, req) => brands.createBrand(ctx, req.body), { status: 201 });
export const update = handle((ctx, req) => brands.updateBrand(ctx, req.params.id, req.body));
export const remove = handle((ctx, req) => brands.deleteBrand(ctx, req.params.id));
export const restore = handle((ctx, req) => brands.restoreBrand(ctx, req.params.id));
