import { buildApp } from './app.js';
import { startDocumentWorker } from './workers/document.worker.js';
import { startNotificationWorker } from './workers/notification.worker.js';
import { startDailyReportWorker } from './workers/daily-report.worker.js';

const app = await buildApp();
const documentWorker = startDocumentWorker();
const notificationWorker = startNotificationWorker();
const dailyReportWorker = await startDailyReportWorker();

try {
  await app.listen({ port: 3000, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  await Promise.all([
    documentWorker.close(),
    notificationWorker.close(),
    dailyReportWorker.close(),
  ]);
  process.exit(1);
}
