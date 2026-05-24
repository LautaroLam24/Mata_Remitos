import { Worker, type Job } from 'bullmq';
import { redis } from '../infrastructure/redis.js';
import { downloadFile } from '../infrastructure/storage.js';
import { db } from '../infrastructure/db.js';
import { extractDocument } from '../features/ocr/extractor.js';
import {
  DOCUMENT_PROCESS_QUEUE,
  type DocumentProcessJobData,
} from '../infrastructure/queue.js';
// Worker uses redis directly (separate from the Queue connection)
import { config } from '../shared/config.js';

async function findOrCreateSupplier(
  tenantId: string,
  cuit: string,
  name: string,
): Promise<string> {
  const existing = await db.supplier.findUnique({
    where: { tenantId_cuit: { tenantId, cuit } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.supplier.create({
    data: { tenantId, cuit, name },
    select: { id: true },
  });
  return created.id;
}

async function processDocument(
  job: Job<DocumentProcessJobData>,
): Promise<{ documentId: string }> {
  const { imageKey, tenantId, userId } = job.data;

  const imageBuffer = await downloadFile(imageKey);
  const extraction = await extractDocument(imageBuffer);

  const supplierId = await findOrCreateSupplier(
    tenantId,
    extraction.supplier.cuit.value,
    extraction.supplier.name.value,
  );

  const imageUrl = `${config.STORAGE_PUBLIC_URL}/${imageKey}`;
  const documentDate = new Date(extraction.date.value);

  const document = await db.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        tenantId,
        supplierId,
        supplierCuit: extraction.supplier.cuit.value,
        type: extraction.documentType,
        documentNumber: extraction.documentNumber.value,
        date: documentDate,
        status: 'review_needed',
        overallConfidence: extraction.overallConfidence,
        rawExtraction: JSON.parse(JSON.stringify(extraction)) as object,
        warnings: extraction.warnings,
        imageUrl,
        uploadedById: userId,
      },
      select: { id: true },
    });

    for (const item of extraction.items) {
      await tx.documentItem.create({
        data: {
          tenantId,
          documentId: doc.id,
          rawDescription: item.description.value,
          quantity: item.quantity.value,
          unit: item.unit.value,
          unitPrice: item.unitPrice.value ?? null,
          confidenceScore: item.quantity.confidence,
          matchStatus: 'pending',
        },
      });
    }

    return doc;
  });

  return { documentId: document.id };
}

export function startDocumentWorker(): Worker<DocumentProcessJobData> {
  const worker = new Worker<DocumentProcessJobData>(
    DOCUMENT_PROCESS_QUEUE,
    processDocument,
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
