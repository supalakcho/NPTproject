// สร้าง Express app (แยกจาก server.js เพื่อให้ test เปิด port เองได้)
import express from 'express';
import routes from './routes/index.js';
import { UPLOAD_DIR } from './middlewares/upload.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import { jsonReplacer } from './controllers/respond.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('json replacer', jsonReplacer); // Date → ISO 8601 +07:00
  app.use(express.json({ limit: '100kb' }));
  app.use('/uploads', express.static(UPLOAD_DIR));
  app.use('/api/v1', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
