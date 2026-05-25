import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../infrastructure/db.js';
import { uploadDocument } from './service.js';
import { getReviewQueue, getDocumentDetail, approveDocument, rejectDocument } from './review-service.js';
import {
  uploadResponseSchema,
  reviewQueueQuerySchema,
  reviewQueueResponseSchema,
  documentDetailResponseSchema,
  approveResponseSchema,
  rejectResponseSchema,
} from './schemas.js';
import { ValidationError } from '../../shared/errors.js';

export const remitoRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

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

      const result = await approveDocument({
        id,
        tenantId: req.tenant.id,
        userId: req.user.sub,
        db,
      });

      return reply.send(result);
    },
  );

  // ─── Reject ───────────────────────────────────────────────────────────────────
  // Body schema is intentionally omitted: `reason` is optional free-form text.
  // Strict body schema would run before preHandler auth, returning 400 before 401
  // for unauthenticated requests with no body.

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
