import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { uploadDocument } from './service.js';
import { uploadResponseSchema } from './schemas.js';
import { ValidationError } from '../../shared/errors.js';

export const remitoRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

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
};
