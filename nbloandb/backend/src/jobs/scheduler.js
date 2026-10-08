// ตั้งเวลางานเบื้องหลัง ปิดได้ด้วย JOBS_ENABLED=false
import cron from 'node-cron';
import { runNotificationJob } from './notification.job.js';
import { logger } from '../services/core/logger.js';

/** @returns {{ stop: () => void }|null} null = ปิดไว้ */
export function startScheduler() {
  if (process.env.JOBS_ENABLED === 'false') return null;
  const task = cron.schedule('*/5 * * * *', () => {
    runNotificationJob().catch((err) => logger.error('scheduler error', err));
  });
  logger.info('scheduler started', { jobs: ['notification every 5 minutes'] });
  return { stop: () => task.stop() };
}
