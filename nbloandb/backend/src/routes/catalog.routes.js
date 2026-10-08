// ยี่ห้อ (B), รุ่น (D), โน๊ตบุ๊ค (N) · route ที่เป็นคำคงที่ต้องมาก่อน /:id
import { Router } from 'express';
import * as brands from '../controllers/brands.controller.js';
import * as models from '../controllers/notebookModels.controller.js';
import * as notebooks from '../controllers/notebooks.controller.js';
import { uploadImage } from '../middlewares/upload.js';

export const brandRoutes = Router()
  .get('/options', brands.options) // B1
  .get('/', brands.list) // B2
  .post('/', brands.create) // B3
  .patch('/:id', brands.update) // B4
  .delete('/:id', brands.remove) // B5
  .post('/:id/restore', brands.restore); // B6

export const modelRoutes = Router()
  .get('/', models.list) // D1
  .get('/:id', models.getById) // D2
  .post('/', models.create) // D3
  .patch('/:id', models.update) // D4
  .post('/:id/image', uploadImage('models'), models.uploadImage) // D5
  .delete('/:id', models.remove) // D6
  .post('/:id/restore', models.restore); // D7

export const notebookRoutes = Router()
  .get('/', notebooks.list) // N1
  .get('/available', notebooks.available) // N2
  .get('/by-asset/:assetCode', notebooks.byAssetCode) // N3
  .get('/:id', notebooks.getById) // N4
  .post('/', notebooks.create) // N5
  .patch('/:id', notebooks.update) // N6
  .delete('/:id', notebooks.remove) // N7
  .post('/:id/restore', notebooks.restore); // N8
