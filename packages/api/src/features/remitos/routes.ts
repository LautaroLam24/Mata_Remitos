import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../infrastructure/db.js';
import { uploadDocument } from './service.js';
import { getReviewQueue, getDocumentDetail, approveDocument, rejectDocument } from './review-service.js';
import { getDocumentQueue } from '../../infrastructure/queue.js';
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

      // 'delayed' (retrying), 'waiting', 'prioritized', 'paused' → all mean "still in queue"
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
