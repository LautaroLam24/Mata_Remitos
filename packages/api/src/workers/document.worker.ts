import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { redis } from '../infrastructure/redis.js';
import { downloadFile } from '../infrastructure/storage.js';
import { db } from '../infrastructure/db.js';
import { extractDocument } from '../features/ocr/extractor.js';
import { matchProduct } from '../features/remitos/validators/matchProduct.js';
import {
  DOCUMENT_PROCESS_QUEUE,
  type DocumentProcessJobData,
} from '../infrastructure/queue.js';
import { enqueueNotification, getTenantOwnerEmails } from '../features/notifications/service.js';
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

function inferMimeTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg':
    default: return 'image/jpeg';
  }
}

async function processDocument(
  job: Job<DocumentProcessJobData>,
): Promise<{ documentId: string }> {
  const { imageKey, tenantId, userId } = job.data;

  const imageBuffer = await downloadFile(imageKey);
  const mimeType = inferMimeTypeFromKey(imageKey);
  const extraction = await extractDocument(imageBuffer, mimeType);

  const supplierId = await findOrCreateSupplier(
    tenantId,
    extraction.supplier.cuit.value,
    extraction.supplier.name.value,
  );

  const catalog = await db.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, code: true, aliases: true },
  });

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
      const match = matchProduct(item.description.value, catalog);

      await tx.documentItem.create({
        data: {
          tenantId,
          documentId: doc.id,
          rawDescription: item.description.value,
          quantity: item.quantity.value,
          unit: item.unit.value,
          unitPrice: item.unitPrice.value ?? null,
          confidenceScore: item.quantity.confidence,
          matchStatus: match ? 'matched' : 'new_product',
          matchScore: match?.score ?? null,
          ...(match ? { productId: match.productId } : {}),
        },
      });
    }

    return doc;
  });

  // Notify tenant owners about new document pending review
  const ownerEmails = await getTenantOwnerEmails(tenantId);
  for (const email of ownerEmails) {
    await enqueueNotification({
      tenantId,
      channel: 'email',
      to: email,
      template: 'document.processed',
      params: {
        documentNumber: extraction.documentNumber.value,
        supplierName: extraction.supplier.name.value,
        confidence: extraction.overallConfidence,
        documentId: document.id,
      },
      correlationId: `doc-processed-${document.id}-${email}`,
    }).catch((err: unknown) => {
      console.error(`[Worker] Failed to enqueue notification: ${String(err)}`);
    });
  }

  return { documentId: document.id };
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

async function safeProcessDocument(job: Job<DocumentProcessJobData>): Promise<{ documentId: string }> {
  try {
    return await processDocument(job);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
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
