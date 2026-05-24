import { buildApp } from './app.js';
import { startDocumentWorker } from './workers/document.worker.js';

const app = await buildApp();
const worker = startDocumentWorker();

try {
  await app.listen({ port: 3000, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  await worker.close();
  process.exit(1);
}
