import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { redis } from '../infrastructure/redis.js';
import { processDocumentCore } from '../features/remitos/processing-core.js';
import { DuplicateDocumentError } from '../features/remitos/errors.js';
import {
  DOCUMENT_PROCESS_QUEUE,
  type DocumentProcessJobData,
} from '../infrastructure/queue.js';

async function safeProcessDocument(
  job: Job<DocumentProcessJobData>,
): Promise<{ documentId: string }> {
  try {
    return await processDocumentCore(job.data);
  } catch (err) {
    if (err instanceof DuplicateDocumentError) {
      throw new UnrecoverableError(
        `Documento duplicado: mismo número, proveedor y fecha ya existe en el sistema`,
      );
    }
    throw err;
  }
}

export function startDocumentWorker(): Worker<DocumentProcessJobData> {
  const worker = new Worker<DocumentProcessJobData>(
    DOCUMENT_PROCESS_QUEUE,
    safeProcessDocument,
    { connection: redis, concurrency: 2 },
  );

  worker.on('completed', (job, result: unknown) => {
    console.log(`Job ${job.id} completed:`, JSON.stringify(result));
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
