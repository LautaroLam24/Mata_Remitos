import { downloadFile } from '../../infrastructure/storage.js';
import { db } from '../../infrastructure/db.js';
import { extractDocument } from '../ocr/extractor.js';
import { matchProduct } from './validators/matchProduct.js';
import { enqueueNotification, getTenantOwnerEmails } from '../notifications/service.js';
import { config } from '../../shared/config.js';
import { DuplicateDocumentError } from './errors.js';

export function inferMimeTypeFromKey(key: string): string {
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

export async function findOrCreateSupplier(
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

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === 'P2002'
  );
}

export async function processDocumentCore(params: {
  imageKey: string;
  tenantId: string;
  userId: string;
}): Promise<{ documentId: string }> {
  const { imageKey, tenantId, userId } = params;

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

  let document: { id: string };
  try {
    document = await db.$transaction(async (tx) => {
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
            matchStatus: match ? 'matched' : 'pending',
            matchScore: match?.score ?? null,
            ...(match ? { productId: match.productId } : {}),
          },
        });
      }

      return doc;
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const existing = await db.document.findFirst({
        where: {
          tenantId,
          documentNumber: extraction.documentNumber.value,
          supplierCuit: extraction.supplier.cuit.value,
          deletedAt: null,
        },
        select: { id: true },
      });
      throw new DuplicateDocumentError({
        documentNumber: extraction.documentNumber.value,
        supplierCuit: extraction.supplier.cuit.value,
        existingId: existing?.id ?? '',
      });
    }
    throw err;
  }

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
    }).catch((notifErr: unknown) => {
      console.error(`[ProcessCore] Failed to enqueue notification: ${String(notifErr)}`);
    });
  }

  return { documentId: document.id };
}
