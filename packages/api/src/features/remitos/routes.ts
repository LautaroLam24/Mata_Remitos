import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../infrastructure/db.js';
import { uploadDocument } from './service.js';
import {
  getReviewQueue,
  getDocumentDetail,
  approveDocument,
  rejectDocument,
  updateDocumentItem,
  createProductFromItem,
  associateItemToProduct,
  createAllUnmatchedProducts,
} from './review-service.js';
import { getDocumentQueue } from '../../infrastructure/queue.js';
import {
  uploadResponseSchema,
  reviewQueueQuerySchema,
  reviewQueueResponseSchema,
  documentDetailResponseSchema,
  approveResponseSchema,
  rejectResponseSchema,
  documentListQuerySchema,
  documentListResponseSchema,
  documentItemSchema,
  updateItemBodySchema,
  createProductFromItemBodySchema,
  associateProductBodySchema,
  createProductFromItemResponseSchema,
  createAllUnmatchedResponseSchema,
} from './schemas.js';
import { ValidationError } from '../../shared/errors.js';
import { downloadFile } from '../../infrastructure/storage.js';
import { config } from '../../shared/config.js';
import { exportToExcel, exportToCsv } from './export-service.js';
import { runValidations } from './validation-service.js';
import { validationsResponseSchema } from './schemas.js';

export const remitoRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ─── List ────────────────────────────────────────────────────────────────────

  r.get(
    '/',
    {
      schema: {
        querystring: documentListQuerySchema,
        response: { 200: documentListResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => {
      const { page, limit, status, supplierId, dateFrom, dateTo, search } = req.query;
      const skip = (page - 1) * limit;

      const where: import('@prisma/client').Prisma.DocumentWhereInput = {
        tenantId: req.tenant.id,
        deletedAt: null,
        ...(status !== 'all' ? { status } : {}),
        ...(supplierId ? { supplierId } : {}),
        ...(search ? { documentNumber: { contains: search, mode: 'insensitive' } } : {}),
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo) } : {}),
              },
            }
          : {}),
      };

      const [docs, total] = await Promise.all([
        db.document.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            supplier: { select: { name: true, cuit: true } },
            _count: { select: { items: true } },
          },
        }),
        db.document.count({ where }),
      ]);

      return {
        items: docs.map((d) => ({
          id: d.id,
          documentNumber: d.documentNumber,
          type: d.type,
          date: d.date.toISOString(),
          status: d.status,
          overallConfidence: d.overallConfidence,
          itemCount: d._count.items,
          supplierName: d.supplier.name,
          supplierCuit: d.supplier.cuit,
          createdAt: d.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    },
  );

  // ─── Upload ──────────────────────────────────────────────────────────────────

  r.post(
    '/upload',
    {
      schema: { response: { 201: uploadResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const file = await req.file();
      if (!file) throw new ValidationError('No file uploaded');

      const result = await uploadDocument({
        file,
        tenantId: req.tenant.id,
        userId: req.user.sub,
      });

      return reply.code(201).send(result);
    },
  );

  // ─── Job status ───────────────────────────────────────────────────────────────

  r.get(
    '/jobs/:jobId',
    {
      schema: {
        params: z.object({ jobId: z.string() }),
        response: {
          200: z.object({
            status: z.enum(['waiting', 'active', 'completed', 'failed', 'unknown']),
            documentId: z.string().optional(),
            error: z.string().optional(),
          }),
        },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { jobId } = req.params;
      const queue = await getDocumentQueue();
      const job = await queue.getJob(jobId);

      if (!job) {
        return reply.send({ status: 'unknown' });
      }

      const jobState = await job.getState();

      if (jobState === 'completed') {
        const result = job.returnvalue as { documentId: string } | undefined;
        return reply.send({
          status: 'completed',
          ...(result?.documentId ? { documentId: result.documentId } : {}),
        });
      }

      if (jobState === 'failed') {
        return reply.send({
          status: 'failed',
          ...(job.failedReason ? { error: job.failedReason } : {}),
        });
      }

      if (jobState === 'active') {
        return reply.send({ status: 'active' });
      }

      return reply.send({ status: 'waiting' });
    },
  );

  // ─── Review queue ─────────────────────────────────────────────────────────────

  r.get(
    '/review-queue',
    {
      schema: {
        querystring: reviewQueueQuerySchema,
        response: { 200: reviewQueueResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { page, limit } = req.query;

      const result = await getReviewQueue({
        tenantId: req.tenant.id,
        page,
        limit,
        db,
      });

      return reply.send(result);
    },
  );

  // ─── Export ───────────────────────────────────────────────────────────────────

  const exportQuerySchema = z.object({
    status: z.enum(['all', 'processing', 'review_needed', 'approved', 'rejected']).optional(),
    supplierId: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    search: z.string().optional(),
  });

  r.get(
    '/export/excel',
    {
      schema: { querystring: exportQuerySchema },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const filters = { tenantId: req.tenant.id, ...req.query };
      const buffer = await exportToExcel(filters);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="MataRemitos_Export_${stamp}.xlsx"`)
        .send(buffer);
    },
  );

  r.get(
    '/export/csv',
    {
      schema: { querystring: exportQuerySchema },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const filters = { tenantId: req.tenant.id, ...req.query };
      const csv = await exportToCsv(filters);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="MataRemitos_Export_${stamp}.csv"`)
        .send(csv);
    },
  );

  // ─── Validations ─────────────────────────────────────────────────────────────

  r.get(
    '/:id/validations',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: validationsResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id } = req.params;
      const result = await runValidations({ id, tenantId: req.tenant.id });
      return reply.send(result);
    },
  );

  // ─── Item: bulk create all unmatched ─────────────────────────────────────────
  // DEBE ir antes de /:id/items/:itemId para que Fastify no capture "create-all-unmatched" como :itemId

  r.post(
    '/:id/items/create-all-unmatched',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: createAllUnmatchedResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id } = req.params;
      const result = await createAllUnmatchedProducts({
        documentId: id,
        tenantId: req.tenant.id,
        userId: req.user.sub,
        db,
      });
      return reply.send({
        ...result,
        items: result.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: item.unitPrice !== null ? Number(item.unitPrice) : null,
        })),
      });
    },
  );

  // ─── Item: PATCH campos editables ────────────────────────────────────────────

  r.patch(
    '/:id/items/:itemId',
    {
      schema: {
        params: z.object({ id: z.string(), itemId: z.string() }),
        body: updateItemBodySchema,
        response: { 200: documentItemSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id, itemId } = req.params;
      const { rawDescription, quantity, unitPrice } = req.body;
      // exactOptionalPropertyTypes: usar spread condicional para evitar pasar undefined explícito
      const updates = {
        ...(rawDescription !== undefined ? { rawDescription } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        ...(unitPrice !== undefined ? { unitPrice } : {}),
      };
      const updated = await updateDocumentItem({
        documentId: id,
        itemId,
        tenantId: req.tenant.id,
        userId: req.user.sub,
        updates,
        db,
      });
      return reply.send({
        ...updated,
        quantity: Number(updated.quantity),
        unitPrice: updated.unitPrice !== null ? Number(updated.unitPrice) : null,
      });
    },
  );

  // ─── Item: crear producto desde ítem ─────────────────────────────────────────

  r.post(
    '/:id/items/:itemId/create-product',
    {
      schema: {
        params: z.object({ id: z.string(), itemId: z.string() }),
        body: createProductFromItemBodySchema,
        response: { 201: createProductFromItemResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id, itemId } = req.params;
      const { code, name, unit, minStock } = req.body;
      // exactOptionalPropertyTypes: pasar minStock solo si no es undefined
      const productData = {
        code,
        name,
        unit,
        ...(minStock !== undefined ? { minStock } : {}),
      };
      const result = await createProductFromItem({
        documentId: id,
        itemId,
        tenantId: req.tenant.id,
        userId: req.user.sub,
        productData,
        db,
      });
      return reply.code(201).send({
        productId: result.productId,
        item: {
          ...result.item,
          quantity: Number(result.item.quantity),
          unitPrice: result.item.unitPrice !== null ? Number(result.item.unitPrice) : null,
        },
      });
    },
  );

  // ─── Item: asociar a producto existente ──────────────────────────────────────

  r.post(
    '/:id/items/:itemId/associate-product',
    {
      schema: {
        params: z.object({ id: z.string(), itemId: z.string() }),
        body: associateProductBodySchema,
        response: { 200: documentItemSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id, itemId } = req.params;
      const { productId } = req.body;
      const updated = await associateItemToProduct({
        documentId: id,
        itemId,
        tenantId: req.tenant.id,
        userId: req.user.sub,
        productId,
        db,
      });
      return reply.send({
        ...updated,
        quantity: Number(updated.quantity),
        unitPrice: updated.unitPrice !== null ? Number(updated.unitPrice) : null,
      });
    },
  );

  // ─── Image proxy ─────────────────────────────────────────────────────────────

  r.get(
    '/:id/image',
    {
      schema: { params: z.object({ id: z.string() }) },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id } = req.params;

      const doc = await db.document.findFirst({
        where: { id, tenantId: req.tenant.id, deletedAt: null },
        select: { imageUrl: true },
      });

      if (!doc) return reply.code(404).send({ message: 'Documento no encontrado' });

      // imageUrl was stored as STORAGE_PUBLIC_URL/key — strip the prefix to get the key
      const prefix = `${config.STORAGE_PUBLIC_URL}/`;
      const imageKey = doc.imageUrl.startsWith(prefix)
        ? doc.imageUrl.slice(prefix.length)
        : doc.imageUrl;

      const buffer = await downloadFile(imageKey);

      const ext = imageKey.split('.').pop()?.toLowerCase() ?? '';
      const contentType =
        ext === 'pdf' ? 'application/pdf' :
        ext === 'png' ? 'image/png' :
        ext === 'webp' ? 'image/webp' :
        'image/jpeg';

      return reply
        .type(contentType)
        .header('Cache-Control', 'private, max-age=3600')
        .send(buffer);
    },
  );

  // ─── Document detail ──────────────────────────────────────────────────────────

  r.get(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: documentDetailResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id } = req.params;

      const doc = await getDocumentDetail({ id, tenantId: req.tenant.id, db });

      return reply.send({
        ...doc,
        items: doc.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unitPrice: item.unitPrice !== null ? Number(item.unitPrice) : null,
        })),
      });
    },
  );

  // ─── Approve ──────────────────────────────────────────────────────────────────

  r.post(
    '/:id/approve',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: approveResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id } = req.params;
      const body = req.body as { overrideReason?: unknown } | undefined;
      const overrideReason =
        typeof body?.overrideReason === 'string' && body.overrideReason.length > 0
          ? body.overrideReason
          : undefined;

      const result = await approveDocument({
        id,
        tenantId: req.tenant.id,
        userId: req.user.sub,
        db,
        ...(overrideReason !== undefined ? { overrideReason } : {}),
      });

      return reply.send(result);
    },
  );

  // ─── Reject ───────────────────────────────────────────────────────────────────

  r.post(
    '/:id/reject',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: rejectResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const { id } = req.params;
      const body = req.body as { reason?: unknown } | undefined;
      const reason = typeof body?.reason === 'string' ? body.reason : undefined;

      const result = await rejectDocument({
        id,
        tenantId: req.tenant.id,
        userId: req.user.sub,
        ...(reason !== undefined && { reason }),
        db,
      });

      return reply.send(result);
    },
  );
};
