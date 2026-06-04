import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  DocumentNotFoundError,
  DocumentItemNotFoundError,
  UnresolvedItemsError,
} from './errors.js';
import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { enqueueNotification, getUserEmail, getTenantOwnerEmails } from '../notifications/service.js';
import { matchProduct } from './validators/matchProduct.js';

export type ReviewQueueItem = {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierCuit: string;
  type: string;
  documentNumber: string;
  date: Date;
  overallConfidence: number;
  warnings: string[];
  imageUrl: string;
  imageThumbnailUrl: string | null;
  createdAt: Date;
};

export type ReviewQueueResult = {
  items: ReviewQueueItem[];
  total: number;
  page: number;
  limit: number;
};

export type DocumentItem = {
  id: string;
  tenantId: string;
  documentId: string;
  productId: string | null;
  rawDescription: string;
  quantity: Prisma.Decimal;
  unit: string;
  unitPrice: Prisma.Decimal | null;
  confidenceScore: number | null;
  matchScore: number | null;
  matchStatus: string;
  humanEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type DocumentDetail = {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierCuit: string;
  type: string;
  documentNumber: string;
  date: Date;
  status: string;
  overallConfidence: number;
  rawExtraction: unknown;
  warnings: string[];
  imageUrl: string;
  imageThumbnailUrl: string | null;
  uploadedById: string;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  items: DocumentItem[];
};

export type ApproveResult = {
  id: string;
  status: 'approved';
  movementsCreated: number;
};

export type RejectResult = {
  id: string;
  status: 'rejected';
};

export async function getReviewQueue(params: {
  tenantId: string;
  page: number;
  limit: number;
  db: PrismaClient;
}): Promise<ReviewQueueResult> {
  const { tenantId, page, limit, db } = params;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    db.document.findMany({
      where: { tenantId, status: 'review_needed', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
      select: {
        id: true,
        tenantId: true,
        supplierId: true,
        supplierCuit: true,
        type: true,
        documentNumber: true,
        date: true,
        overallConfidence: true,
        warnings: true,
        imageUrl: true,
        imageThumbnailUrl: true,
        createdAt: true,
      },
    }),
    db.document.count({
      where: { tenantId, status: 'review_needed', deletedAt: null },
    }),
  ]);

  return { items, total, page, limit };
}

export async function getDocumentDetail(params: {
  id: string;
  tenantId: string;
  db: PrismaClient;
}): Promise<DocumentDetail> {
  const { id, tenantId, db } = params;

  const doc = await db.document.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { items: true },
  });

  if (!doc) throw new DocumentNotFoundError(id);

  return doc as DocumentDetail;
}

export async function approveDocument(params: {
  id: string;
  tenantId: string;
  userId: string;
  overrideReason?: string;
  db: PrismaClient;
}): Promise<ApproveResult> {
  const { id, tenantId, userId, overrideReason, db } = params;

  const doc = await db.document.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { items: true },
  });

  if (!doc) throw new DocumentNotFoundError(id);

  if (doc.status !== 'review_needed') {
    throw new ConflictError(
      `Documento ya fue procesado (status: ${doc.status})`,
      { id, status: doc.status },
    );
  }

  // Bloquear si hay ítems sin resolver (pending) o en estado inválido (new_product sin productId)
  const unresolvedItems = doc.items.filter(
    (i) =>
      !i.deletedAt &&
      (i.matchStatus === 'pending' ||
        (i.matchStatus === 'new_product' && i.productId === null)),
  );
  if (unresolvedItems.length > 0) {
    throw new UnresolvedItemsError(unresolvedItems.length);
  }

  let movementsCreated = 0;

  await db.$transaction(async (tx) => {
    for (const item of doc.items) {
      // Solo procesar ítems con productId asignado (matched o new_product)
      if (!item.productId || (item.matchStatus !== 'matched' && item.matchStatus !== 'new_product')) continue;

      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { id: true, stockOnHand: true },
      });

      if (!product) continue;

      const balanceBefore = product.stockOnHand;
      const balanceAfter = new Prisma.Decimal(balanceBefore).plus(item.quantity);

      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          userId,
          type: 'in',
          reason: 'document',
          reference: doc.id,
          quantity: item.quantity,
          balanceBefore,
          balanceAfter,
        },
      });

      await tx.product.update({
        where: { id: item.productId },
        data: { stockOnHand: balanceAfter },
      });

      movementsCreated++;
    }

    await tx.document.update({
      where: { id },
      data: { status: 'approved', approvedById: userId, approvedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'Document',
        entityId: doc.id,
        action: overrideReason ? 'override' : 'approve',
        changes: {
          before: { status: 'review_needed' },
          after: { status: 'approved' },
          ...(overrideReason !== undefined ? { overrideReason } : {}),
        },
      },
    });
  });

  // Notify uploader
  const uploaderEmail = await getUserEmail(doc.uploadedById);
  if (uploaderEmail) {
    const supplier = await db.supplier.findUnique({
      where: { id: doc.supplierId },
      select: { name: true },
    });
    await enqueueNotification({
      tenantId,
      channel: 'email',
      to: uploaderEmail,
      template: 'document.approved',
      params: {
        documentNumber: doc.documentNumber,
        supplierName: supplier?.name ?? doc.supplierCuit,
        movementsCreated,
        documentId: id,
      },
      correlationId: `doc-approved-${id}`,
    }).catch((err: unknown) => {
      console.error(`[Review] Failed to enqueue approved notification: ${String(err)}`);
    });
  }

  // Check for low-stock products and alert owners
  const lowStockProducts = await db.$queryRaw<
    Array<{ id: string; name: string; code: string; stockOnHand: number; unit: string; minStock: number }>
  >`
    SELECT id, name, code, "stockOnHand", unit, "minStock"
    FROM products
    WHERE "tenantId" = ${tenantId}
      AND "deletedAt" IS NULL
      AND "minStock" IS NOT NULL
      AND "stockOnHand" <= "minStock"
    ORDER BY "stockOnHand" ASC
    LIMIT 10
  `;

  if (lowStockProducts.length > 0) {
    const ownerEmails = await getTenantOwnerEmails(tenantId);
    for (const email of ownerEmails) {
      await enqueueNotification({
        tenantId,
        channel: 'email',
        to: email,
        template: 'stock.low',
        params: { products: lowStockProducts },
        correlationId: `stock-low-${id}-${email}`,
      }).catch((err: unknown) => {
        console.error(`[Review] Failed to enqueue low-stock notification: ${String(err)}`);
      });
    }
  }

  return { id, status: 'approved', movementsCreated };
}

// ─── Item resolution ──────────────────────────────────────────────────────────

export async function updateDocumentItem(params: {
  documentId: string;
  itemId: string;
  tenantId: string;
  userId: string;
  updates: { rawDescription?: string; quantity?: number; unitPrice?: number };
  db: PrismaClient;
}): Promise<DocumentItem> {
  const { documentId, itemId, tenantId, userId, updates, db } = params;

  await db.document.findFirst({ where: { id: documentId, tenantId, deletedAt: null } }).then((d) => {
    if (!d) throw new DocumentNotFoundError(documentId);
  });

  const item = await db.documentItem.findFirst({
    where: { id: itemId, documentId, tenantId, deletedAt: null },
  });
  if (!item) throw new DocumentItemNotFoundError(itemId);

  const before: Record<string, string | number | boolean | null> = {};
  const after: Record<string, string | number | boolean | null> = {};

  type UpdateData = {
    humanEdited: boolean;
    rawDescription?: string;
    productId?: string | null;
    matchScore?: number | null;
    matchStatus?: string;
    quantity?: Prisma.Decimal;
    confidenceScore?: number;
    unitPrice?: Prisma.Decimal | null;
  };

  const updateData: UpdateData = { humanEdited: true };

  if (updates.rawDescription !== undefined) {
    before['rawDescription'] = item.rawDescription;
    after['rawDescription'] = updates.rawDescription;
    updateData.rawDescription = updates.rawDescription;

    // Re-correr el match solo si el ítem no fue resuelto manualmente
    if (item.matchStatus !== 'new_product') {
      const rawCatalog = await db.product.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, code: true, aliases: true, typicalRange: true },
      });
      const catalog = rawCatalog.map((p) => ({
        ...p,
        typicalRange: (p.typicalRange as { min: number; max: number } | null) ?? null,
      }));
      const match = matchProduct(updates.rawDescription, catalog);
      if (match) {
        updateData.productId = match.productId;
        updateData.matchScore = match.score;
        updateData.matchStatus = 'matched';
      } else {
        // Solo volver a pending si no estaba ya asociado manualmente
        if (item.matchStatus !== 'matched') {
          updateData.productId = null;
          updateData.matchScore = null;
          updateData.matchStatus = 'pending';
        }
      }
    }
  }

  if (updates.quantity !== undefined) {
    before['quantity'] = Number(item.quantity);
    after['quantity'] = updates.quantity;
    updateData.quantity = new Prisma.Decimal(updates.quantity);
    updateData.confidenceScore = 100;
  }

  if (updates.unitPrice !== undefined) {
    before['unitPrice'] = item.unitPrice !== null ? Number(item.unitPrice) : null;
    after['unitPrice'] = updates.unitPrice;
    updateData.unitPrice = new Prisma.Decimal(updates.unitPrice);
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.documentItem.update({ where: { id: itemId }, data: updateData });
    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'DocumentItem',
        entityId: itemId,
        action: 'update',
        changes: { before, after, documentId },
      },
    });
    return result;
  });

  return updated as DocumentItem;
}

export async function createProductFromItem(params: {
  documentId: string;
  itemId: string;
  tenantId: string;
  userId: string;
  productData: { code: string; name: string; unit: string; minStock?: number | null };
  db: PrismaClient;
}): Promise<{ productId: string; item: DocumentItem }> {
  const { documentId, itemId, tenantId, userId, productData, db } = params;

  const item = await db.documentItem.findFirst({
    where: { id: itemId, documentId, tenantId, deletedAt: null },
  });
  if (!item) throw new DocumentItemNotFoundError(itemId);

  const result = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        tenantId,
        code: productData.code,
        name: productData.name,
        unit: productData.unit,
        stockOnHand: new Prisma.Decimal(0),
        aliases: [item.rawDescription],
        ...(productData.minStock != null ? { minStock: new Prisma.Decimal(productData.minStock) } : {}),
      },
    });

    const updatedItem = await tx.documentItem.update({
      where: { id: itemId },
      data: { productId: created.id, matchStatus: 'new_product', matchScore: 100 },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'Product',
        entityId: created.id,
        action: 'create',
        changes: {
          after: { code: productData.code, name: productData.name, unit: productData.unit },
          documentId,
          itemId,
        },
      },
    });

    return { productId: created.id, item: updatedItem as DocumentItem };
  });

  return result;
}

export async function associateItemToProduct(params: {
  documentId: string;
  itemId: string;
  tenantId: string;
  userId: string;
  productId: string;
  db: PrismaClient;
}): Promise<DocumentItem> {
  const { documentId, itemId, tenantId, userId, productId, db } = params;

  const product = await db.product.findFirst({
    where: { id: productId, tenantId, deletedAt: null },
    select: { id: true, aliases: true },
  });
  if (!product) throw new NotFoundError('Product', productId);

  const item = await db.documentItem.findFirst({
    where: { id: itemId, documentId, tenantId, deletedAt: null },
  });
  if (!item) throw new DocumentItemNotFoundError(itemId);

  // Guardar alias para que la próxima vez matchee solo
  const normalizedAlias = item.rawDescription.trim().toLowerCase();
  const alreadyHasAlias = product.aliases.some((a) => a.trim().toLowerCase() === normalizedAlias);

  const updated = await db.$transaction(async (tx) => {
    const updatedItem = await tx.documentItem.update({
      where: { id: itemId },
      data: { productId, matchStatus: 'matched', matchScore: 100 },
    });

    if (!alreadyHasAlias) {
      await tx.product.update({
        where: { id: productId },
        data: { aliases: { push: item.rawDescription } },
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'DocumentItem',
        entityId: itemId,
        action: 'associate',
        changes: {
          before: { productId: item.productId, matchStatus: item.matchStatus },
          after: { productId, matchStatus: 'matched' },
          aliasAdded: !alreadyHasAlias ? item.rawDescription : null,
          documentId,
        },
      },
    });

    return updatedItem as DocumentItem;
  });

  return updated;
}

export async function createAllUnmatchedProducts(params: {
  documentId: string;
  tenantId: string;
  userId: string;
  db: PrismaClient;
}): Promise<{ created: number; items: DocumentItem[] }> {
  const { documentId, tenantId, userId, db } = params;

  const doc = await db.document.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!doc) throw new DocumentNotFoundError(documentId);

  const pendingItems = await db.documentItem.findMany({
    where: { documentId, tenantId, matchStatus: 'pending', deletedAt: null },
  });

  const createdItems: DocumentItem[] = [];

  for (const item of pendingItems) {
    // Código único garantizado: sufijo del cuid del ítem
    const code = `AUTO-${item.id.slice(-10).toUpperCase()}`;
    try {
      const result = await db.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            tenantId,
            code,
            name: item.rawDescription,
            unit: item.unit,
            stockOnHand: new Prisma.Decimal(0),
            aliases: [item.rawDescription],
          },
        });

        const updatedItem = await tx.documentItem.update({
          where: { id: item.id },
          data: { productId: created.id, matchStatus: 'new_product', matchScore: 100 },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            entityType: 'Product',
            entityId: created.id,
            action: 'create',
            changes: {
              after: { code, name: item.rawDescription, unit: item.unit },
              documentId,
              itemId: item.id,
              source: 'bulk_create',
            },
          },
        });

        return updatedItem as DocumentItem;
      });
      createdItems.push(result);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Código ya existe — saltar este ítem (caso extremadamente improbable)
        continue;
      }
      throw err;
    }
  }

  return { created: createdItems.length, items: createdItems };
}

export async function rejectDocument(params: {
  id: string;
  tenantId: string;
  userId: string;
  reason?: string;
  db: PrismaClient;
}): Promise<RejectResult> {
  const { id, tenantId, userId, reason, db } = params;

  const doc = await db.document.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!doc) throw new DocumentNotFoundError(id);

  if (doc.status !== 'review_needed') {
    throw new ConflictError(
      `Documento ya fue procesado (status: ${doc.status})`,
      { id, status: doc.status },
    );
  }

  await db.$transaction(async (tx) => {
    await tx.document.update({
      where: { id },
      data: { status: 'rejected' },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'Document',
        entityId: doc.id,
        action: 'reject',
        changes: {
          before: { status: 'review_needed' },
          after: { status: 'rejected' },
          ...(reason !== undefined && { reason }),
        },
      },
    });
  });

  // Notify uploader
  const fullDoc = await db.document.findUnique({
    where: { id },
    select: { documentNumber: true, uploadedById: true, supplierId: true, supplierCuit: true },
  });

  if (fullDoc?.uploadedById) {
    const [uploaderEmail, supplier] = await Promise.all([
      getUserEmail(fullDoc.uploadedById),
      db.supplier.findUnique({ where: { id: fullDoc.supplierId }, select: { name: true } }),
    ]);
    if (uploaderEmail) {
      await enqueueNotification({
        tenantId,
        channel: 'email',
        to: uploaderEmail,
        template: 'document.rejected',
        params: {
          documentNumber: fullDoc.documentNumber,
          supplierName: supplier?.name ?? fullDoc.supplierCuit,
          reason,
          documentId: id,
        },
        correlationId: `doc-rejected-${id}`,
      }).catch((err: unknown) => {
        console.error(`[Review] Failed to enqueue rejected notification: ${String(err)}`);
      });
    }
  }

  return { id, status: 'rejected' };
}
