import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { DocumentNotFoundError } from './errors.js';
import { ConflictError } from '../../shared/errors.js';

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
  db: PrismaClient;
}): Promise<ApproveResult> {
  const { id, tenantId, userId, db } = params;

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

  let movementsCreated = 0;

  await db.$transaction(async (tx) => {
    for (const item of doc.items) {
      if (item.matchStatus !== 'matched' || !item.productId) continue;

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
        action: 'approve',
        changes: { before: { status: 'review_needed' }, after: { status: 'approved' } },
      },
    });
  });

  return { id, status: 'approved', movementsCreated };
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

  return { id, status: 'rejected' };
}
