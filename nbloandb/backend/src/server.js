// จุดเริ่มต้น: npm start → http://localhost:3000/api/v1
import 'dotenv/config';
import { createApp } from './app.js';
import { startScheduler } from './jobs/scheduler.js';
import { closePool } from './models/index.js';
import { logger } from './services/core/logger.js';

const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, () => {
  logger.info('server started', { port });
  console.log(`API ready at http://localhost:${port}/api/v1`);
});
const scheduler = startScheduler();

function shutdown() {
  scheduler?.stop();
  server.close(() => closePool().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
