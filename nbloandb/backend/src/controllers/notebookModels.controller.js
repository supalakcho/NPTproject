// D1–D7 รุ่น
import { notebookModels } from '../services/index.js';
import { discardUpload } from '../middlewares/upload.js';
import { handle } from './respond.js';

export const list = handle((ctx, req) => notebookModels.listModels(ctx, req.query));
export const getById = handle((ctx, req) => notebookModels.getById(ctx, req.params.id));
export const create = handle((ctx, req) => notebookModels.createModel(ctx, req.body), { status: 201 });
export const update = handle((ctx, req) => notebookModels.updateModel(ctx, req.params.id, req.body));
export const uploadImage = handle((ctx, req) =>
  notebookModels.updateModel(ctx, req.params.id, { imagePath: req.uploadPath }).catch((err) => {
    discardUpload(req);
    throw err;
  }),
);
export const remove = handle((ctx, req) => notebookModels.deleteModel(ctx, req.params.id));
export const restore = handle((ctx, req) => notebookModels.restoreModel(ctx, req.params.id));
