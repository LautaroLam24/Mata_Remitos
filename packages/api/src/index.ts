import type { Worker } from 'bullmq';
import { buildApp } from './app.js';
import { config } from './shared/config.js';

const app = await buildApp();
const workers: Worker[] = [];

if (config.OCR_SYNC !== 'true') {
  const [
    { startDocumentWorker },
    { startNotificationWorker },
    { startDailyReportWorker },
  ] = await Promise.all([
    import('./workers/document.worker.js'),
    import('./workers/notification.worker.js'),
    import('./workers/daily-report.worker.js'),
  ]);
  workers.push(startDocumentWorker());
  workers.push(startNotificationWorker());
  workers.push(await startDailyReportWorker());
} else {
  console.log('[Server] OCR_SYNC=true — workers deshabilitados, modo síncrono activo');
}

try {
  await app.listen({ port: Number(process.env['PORT'] ?? 3000), host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  await Promise.all(workers.map((w) => w.close()));
  process.exit(1);
}
