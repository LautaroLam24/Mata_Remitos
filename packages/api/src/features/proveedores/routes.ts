import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  proveedorListQuerySchema,
  proveedorCreateSchema,
  proveedorUpdateSchema,
  proveedorListResponseSchema,
} from './schemas.js';
import { listProveedores, createProveedor, updateProveedor } from './service.js';

const proveedorResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuit: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
});

export const proveedoresRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      schema: { querystring: proveedorListQuerySchema, response: { 200: proveedorListResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => listProveedores(req.tenant.id, req.query),
  );

  r.post(
    '/',
    {
      schema: { body: proveedorCreateSchema, response: { 201: proveedorResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      const result = await createProveedor(req.tenant.id, req.body);
      return reply.code(201).send(result);
    },
  );

  r.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: proveedorUpdateSchema,
        response: { 200: proveedorResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => updateProveedor(req.tenant.id, req.params.id, req.body),
  );
};
