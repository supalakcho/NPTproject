import { config } from './config.js';
import { closeDb } from './db.js';
import { createApp } from './app.js';

const server = createApp().listen(config.port, () => {
  console.log(`User Management listening on :${config.port} (${config.env})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
