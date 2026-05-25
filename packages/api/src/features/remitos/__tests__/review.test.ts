import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

vi.mock('../../../infrastructure/storage.js', () => ({
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('../../../infrastructure/queue.js', () => ({
  DOCUMENT_PROCESS_QUEUE: 'document.process',
  getDocumentQueue: vi.fn().mockResolvedValue({
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
  }),
}));

vi.mock('../../../infrastructure/redis.js', () => ({
  redis: { options: {} },
}));

vi.mock('../../../infrastructure/db.js', () => ({
  db: {
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

import {
  getReviewQueue,
  getDocumentDetail,
  approveDocument,
  rejectDocument,
} from '../review-service.js';
import { DocumentNotFoundError } from '../errors.js';
import { ConflictError } from '../../../shared/errors.js';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant1';
const USER_ID = 'user-1';
const DOC_ID = 'doc-1';

const mockDoc = {
  id: DOC_ID,
  tenantId: TENANT_ID,
  supplierId: 'sup-1',
  supplierCuit: '20-30678774-9',
  type: 'remito',
  documentNumber: 'R-001-00000001',
  date: new Date('2024-03-15'),
  status: 'review_needed',
  overallConfidence: 75,
  rawExtraction: {},
  warnings: ['Confianza baja en fecha'],
  imageUrl: 'r2://bucket/tenant1/img.jpg',
  imageThumbnailUrl: null,
  uploadedById: USER_ID,
  approvedById: null,
  approvedAt: null,
  createdAt: new Date('2024-03-15T10:00:00Z'),
  updatedAt: new Date('2024-03-15T10:00:00Z'),
  deletedAt: null,
};

const mockItem = {
  id: 'item-1',
  tenantId: TENANT_ID,
  documentId: DOC_ID,
  productId: 'p1',
  rawDescription: 'Harina 0000 x 25kg',
  quantity: new Prisma.Decimal(10),
  unit: 'kg',
  unitPrice: null,
  confidenceScore: 95,
  matchScore: 92,
  matchStatus: 'matched',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockProduct = {
  id: 'p1',
  tenantId: TENANT_ID,
  code: 'HAR-001',
  name: 'Harina 0000 x 25kg',
  unit: 'kg',
  stockOnHand: new Prisma.Decimal(100),
  minStock: null,
  aliases: [],
  typicalRange: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

// ─── getReviewQueue ───────────────────────────────────────────────────────────

describe('getReviewQueue', () => {
  it('fetches review_needed documents for tenant in chronological order', async () => {
    const mockDb = {
      document: {
        findMany: vi.fn().mockResolvedValue([mockDoc]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient;

    const result = await getReviewQueue({ tenantId: TENANT_ID, page: 1, limit: 10, db: mockDb });

    expect(mockDb.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID, status: 'review_needed', deletedAt: null }),
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('applies correct skip and take for page 3 with limit 5', async () => {
    const mockDb = {
      document: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaClient;

    await getReviewQueue({ tenantId: TENANT_ID, page: 3, limit: 5, db: mockDb });

    expect(mockDb.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
  });

  it('returns page and limit metadata in response', async () => {
    const mockDb = {
      document: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaClient;

    const result = await getReviewQueue({ tenantId: TENANT_ID, page: 2, limit: 5, db: mockDb });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(5);
    expect(result.total).toBe(0);
  });

  it('runs findMany and count in parallel', async () => {
    const calls: string[] = [];
    const mockDb = {
      document: {
        findMany: vi.fn().mockImplementation(async () => { calls.push('findMany'); return []; }),
        count: vi.fn().mockImplementation(async () => { calls.push('count'); return 0; }),
      },
    } as unknown as PrismaClient;

    await getReviewQueue({ tenantId: TENANT_ID, page: 1, limit: 10, db: mockDb });

    expect(calls).toContain('findMany');
    expect(calls).toContain('count');
  });
});

// ─── getDocumentDetail ────────────────────────────────────────────────────────

describe('getDocumentDetail', () => {
  it('returns document with items when found for correct tenant', async () => {
    const docWithItems = { ...mockDoc, items: [mockItem] };
    const mockDb = {
      document: { findFirst: vi.fn().mockResolvedValue(docWithItems) },
    } as unknown as PrismaClient;

    const result = await getDocumentDetail({ id: DOC_ID, tenantId: TENANT_ID, db: mockDb });

    expect(result.id).toBe(DOC_ID);
    expect(result.items).toHaveLength(1);
  });

  it('queries with both id and tenantId for tenant isolation', async () => {
    const mockDb = {
      document: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(getDocumentDetail({ id: DOC_ID, tenantId: 'wrong-tenant', db: mockDb }))
      .rejects.toThrow(DocumentNotFoundError);

    expect(mockDb.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: DOC_ID, tenantId: 'wrong-tenant', deletedAt: null }),
      }),
    );
  });

  it('throws DocumentNotFoundError when document does not exist', async () => {
    const mockDb = {
      document: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(getDocumentDetail({ id: 'nonexistent', tenantId: TENANT_ID, db: mockDb }))
      .rejects.toThrow(DocumentNotFoundError);
  });
});

// ─── approveDocument ──────────────────────────────────────────────────────────

describe('approveDocument', () => {
  let mockTx: {
    document: { update: ReturnType<typeof vi.fn> };
    product: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    stockMovement: { create: ReturnType<typeof vi.fn> };
    auditLog: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockTx = {
      document: {
        update: vi.fn().mockResolvedValue({ ...mockDoc, status: 'approved' }),
      },
      product: {
        findUnique: vi.fn().mockResolvedValue(mockProduct),
        update: vi.fn().mockResolvedValue({ ...mockProduct, stockOnHand: new Prisma.Decimal(110) }),
      },
      stockMovement: { create: vi.fn().mockResolvedValue({ id: 'sm-1' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'al-1' }) },
    };
  });

  function makeDb(docResult: unknown = { ...mockDoc, items: [mockItem] }) {
    return {
      document: { findFirst: vi.fn().mockResolvedValue(docResult) },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    } as unknown as PrismaClient;
  }

  it('creates StockMovement for each matched item with correct fields', async () => {
    const db = makeDb();
    await approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(mockTx.stockMovement.create).toHaveBeenCalledOnce();
    expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          productId: 'p1',
          userId: USER_ID,
          type: 'in',
          reason: 'document',
          reference: DOC_ID,
        }),
      }),
    );
  });

  it('stores correct balanceBefore and balanceAfter in StockMovement', async () => {
    const db = makeDb();
    await approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    const callArg = mockTx.stockMovement.create.mock.calls[0][0];
    expect(Number(callArg.data.balanceBefore)).toBe(100);
    expect(Number(callArg.data.balanceAfter)).toBe(110);
  });

  it('updates Product.stockOnHand for each matched item', async () => {
    const db = makeDb();
    await approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(mockTx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' } }),
    );
  });

  it('sets document status to approved with approvedById and approvedAt', async () => {
    const db = makeDb();
    await approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(mockTx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DOC_ID },
        data: expect.objectContaining({
          status: 'approved',
          approvedById: USER_ID,
          approvedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('creates AuditLog entry with approve action', async () => {
    const db = makeDb();
    await approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          entityType: 'Document',
          entityId: DOC_ID,
          action: 'approve',
        }),
      }),
    );
  });

  it('skips items where matchStatus is not matched', async () => {
    const unmatchedItem = { ...mockItem, matchStatus: 'new_product', productId: null };
    const db = makeDb({ ...mockDoc, items: [unmatchedItem] });

    await approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(mockTx.stockMovement.create).not.toHaveBeenCalled();
    expect(mockTx.product.update).not.toHaveBeenCalled();
  });

  it('wraps all writes in a single $transaction', async () => {
    const db = makeDb();
    await approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(db.$transaction).toHaveBeenCalledOnce();
  });

  it('throws DocumentNotFoundError when document does not exist', async () => {
    const db = makeDb(null);

    await expect(approveDocument({ id: 'nope', tenantId: TENANT_ID, userId: USER_ID, db }))
      .rejects.toThrow(DocumentNotFoundError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws ConflictError when document is already approved', async () => {
    const db = makeDb({ ...mockDoc, status: 'approved', items: [mockItem] });

    await expect(approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db }))
      .rejects.toThrow(ConflictError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws ConflictError when document is rejected', async () => {
    const db = makeDb({ ...mockDoc, status: 'rejected', items: [mockItem] });

    await expect(approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db }))
      .rejects.toThrow(ConflictError);
  });

  it('propagates errors thrown inside transaction (rollback guaranteed by Prisma)', async () => {
    const failingTx = {
      ...mockTx,
      product: {
        findUnique: vi.fn().mockRejectedValue(new Error('DB connection lost')),
        update: vi.fn(),
      },
    };
    const db = {
      document: { findFirst: vi.fn().mockResolvedValue({ ...mockDoc, items: [mockItem] }) },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(failingTx)),
    } as unknown as PrismaClient;

    await expect(approveDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db }))
      .rejects.toThrow('DB connection lost');

    expect(failingTx.stockMovement.create).not.toHaveBeenCalled();
  });
});

// ─── rejectDocument ───────────────────────────────────────────────────────────

describe('rejectDocument', () => {
  let mockTx: {
    document: { update: ReturnType<typeof vi.fn> };
    auditLog: { create: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockTx = {
      document: { update: vi.fn().mockResolvedValue({ ...mockDoc, status: 'rejected' }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'al-1' }) },
    };
  });

  function makeDb(docResult: unknown = { ...mockDoc }) {
    return {
      document: { findFirst: vi.fn().mockResolvedValue(docResult) },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    } as unknown as PrismaClient;
  }

  it('sets document status to rejected and creates AuditLog', async () => {
    const db = makeDb();
    await rejectDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(mockTx.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DOC_ID },
        data: expect.objectContaining({ status: 'rejected' }),
      }),
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          entityType: 'Document',
          entityId: DOC_ID,
          action: 'reject',
        }),
      }),
    );
  });

  it('includes optional reason in the changes audit log when provided', async () => {
    const db = makeDb();
    await rejectDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, reason: 'Datos incorrectos', db });

    const auditCall = mockTx.auditLog.create.mock.calls[0][0];
    expect(JSON.stringify(auditCall.data.changes)).toContain('Datos incorrectos');
  });

  it('throws DocumentNotFoundError when document does not exist', async () => {
    const db = makeDb(null);

    await expect(rejectDocument({ id: 'nope', tenantId: TENANT_ID, userId: USER_ID, db }))
      .rejects.toThrow(DocumentNotFoundError);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('throws ConflictError when document is already approved', async () => {
    const db = makeDb({ ...mockDoc, status: 'approved' });

    await expect(rejectDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db }))
      .rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when document is already rejected', async () => {
    const db = makeDb({ ...mockDoc, status: 'rejected' });

    await expect(rejectDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db }))
      .rejects.toThrow(ConflictError);
  });

  it('wraps writes in a single $transaction', async () => {
    const db = makeDb();
    await rejectDocument({ id: DOC_ID, tenantId: TENANT_ID, userId: USER_ID, db });

    expect(db.$transaction).toHaveBeenCalledOnce();
  });
});

// ─── Route HTTP boundary tests ────────────────────────────────────────────────

describe('review endpoints — auth boundary', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const endpoints = [
    { method: 'GET', url: '/api/remitos/review-queue' },
    { method: 'GET', url: '/api/remitos/doc-123' },
    { method: 'POST', url: '/api/remitos/doc-123/approve' },
    { method: 'POST', url: '/api/remitos/doc-123/reject' },
  ] as const;

  for (const { method, url } of endpoints) {
    it(`${method} ${url} returns 401 without Authorization header`, async () => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    });

    it(`${method} ${url} returns 401 with malformed token`, async () => {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: 'Bearer not.a.valid.token' },
      });
      expect(res.statusCode).toBe(401);
    });
  }
});
