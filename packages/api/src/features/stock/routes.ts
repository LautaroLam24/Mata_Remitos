import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { db } from '../../infrastructure/db.js';
import { stockAlertsResponseSchema } from './schemas.js';

export const stockRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/alerts',
    {
      schema: { response: { 200: stockAlertsResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => {
      const products = await db.product.findMany({
        where: { tenantId: req.tenant.id, deletedAt: null },
        select: { id: true, code: true, name: true, unit: true, stockOnHand: true, minStock: true },
        orderBy: { stockOnHand: 'asc' },
      });

      const critical = products
        .filter((p) => Number(p.stockOnHand) <= 0)
        .map((p) => ({ ...p, stockOnHand: Number(p.stockOnHand), minStock: p.minStock ? Number(p.minStock) : null }));

      const atRisk = products
        .filter(
          (p) =>
            p.minStock !== null &&
            Number(p.stockOnHand) > 0 &&
            Number(p.stockOnHand) < Number(p.minStock),
        )
        .map((p) => ({ ...p, stockOnHand: Number(p.stockOnHand), minStock: Number(p.minStock) }));

      return { critical, atRisk };
    },
  );
};
