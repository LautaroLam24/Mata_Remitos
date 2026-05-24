import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const DOCUMENT_PROCESS_QUEUE = 'document.process';

export interface DocumentProcessJobData {
  imageKey: string;
  tenantId: string;
  userId: string;
}

let _queue: Queue<DocumentProcessJobData> | undefined;

// Lazy initialization: Queue (and its Redis connection) is only created
// when the first job is added, not at module import time.
export async function getDocumentQueue(): Promise<Queue<DocumentProcessJobData>> {
  if (!_queue) {
    const { redis } = await import('./redis.js');
    _queue = new Queue<DocumentProcessJobData>(DOCUMENT_PROCESS_QUEUE, {
      connection: redis as Redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _queue;
}
