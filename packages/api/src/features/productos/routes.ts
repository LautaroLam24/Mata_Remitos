import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  productoListQuerySchema,
  productoCreateSchema,
  productoUpdateSchema,
  productoListResponseSchema,
  productoDetailResponseSchema,
} from './schemas.js';
import {
  listProductos,
  getProductoById,
  createProducto,
  updateProducto,
  softDeleteProducto,
} from './service.js';

export const productosRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      schema: {
        querystring: productoListQuerySchema,
        response: { 200: productoListResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => listProductos(req.tenant.id, req.query),
  );

  r.get(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: productoDetailResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => getProductoById(req.tenant.id, req.params.id),
  );

  r.post(
    '/',
    {
      schema: {
        body: productoCreateSchema,
        response: { 201: productoDetailResponseSchema.omit({ stockMovements: true }) },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const result = await createProducto(req.tenant.id, req.body);
      return reply.code(201).send(result);
    },
  );

  r.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: productoUpdateSchema,
        response: { 200: productoDetailResponseSchema.omit({ stockMovements: true }) },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => updateProducto(req.tenant.id, req.params.id, req.body),
  );

  r.delete(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ id: z.string(), deletedAt: z.string() }) },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => {
      const result = await softDeleteProducto(req.tenant.id, req.params.id);
      return { id: result.id, deletedAt: result.deletedAt! };
    },
  );
};
