// S1–S3 ค่าตั้งค่า
import { settings } from '../services/index.js';
import { handle } from './respond.js';

export const getPublic = handle((ctx) => settings.getPublic(ctx));
export const list = handle((ctx) => settings.listDetailed(ctx));
export const update = handle((ctx, req) => settings.update(ctx, req.body));
