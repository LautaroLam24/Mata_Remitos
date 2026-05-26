import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../infrastructure/db.js';

const metricsResponseSchema = z.object({
  remitosThisMonth: z.number(),
  enRevision: z.number(),
  productosActivos: z.number(),
  precisionOcr: z.number().nullable(),
  recentActivity: z.array(
    z.object({
      id: z.string(),
      documentNumber: z.string(),
      supplierName: z.string(),
      status: z.string(),
      overallConfidence: z.number(),
      createdAt: z.string(),
    }),
  ),
});

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/metrics',
    {
      schema: { response: { 200: metricsResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => {
      const tenantId = req.tenant.id;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [remitosThisMonth, enRevision, productosActivos, recentDocs, avgResult] =
        await Promise.all([
          db.document.count({
            where: { tenantId, deletedAt: null, createdAt: { gte: startOfMonth } },
          }),
          db.document.count({
            where: { tenantId, deletedAt: null, status: 'review_needed' },
          }),
          db.product.count({
            where: { tenantId, deletedAt: null },
          }),
          db.document.findMany({
            where: { tenantId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { supplier: { select: { name: true } } },
          }),
          db.document.aggregate({
            where: {
              tenantId,
              deletedAt: null,
              createdAt: { gte: thirtyDaysAgo },
              status: { notIn: ['processing'] },
            },
            _avg: { overallConfidence: true },
          }),
        ]);

      return {
        remitosThisMonth,
        enRevision,
        productosActivos,
        precisionOcr:
          avgResult._avg.overallConfidence !== null
            ? Math.round(avgResult._avg.overallConfidence)
            : null,
        recentActivity: recentDocs.map((d) => ({
          id: d.id,
          documentNumber: d.documentNumber,
          supplierName: d.supplier.name,
          status: d.status,
          overallConfidence: d.overallConfidence,
          createdAt: d.createdAt.toISOString(),
        })),
      };
    },
  );
};
