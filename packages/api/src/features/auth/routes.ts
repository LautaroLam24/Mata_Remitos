import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  registerBodySchema,
  loginBodySchema,
  refreshBodySchema,
  authResponseSchema,
  tokenPairSchema,
} from './schemas.js';
import { registerUser, loginUser, refreshTokens } from './service.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/register',
    {
      schema: {
        body: registerBodySchema,
        response: { 201: authResponseSchema },
      },
    },
    async (req, reply) => {
      const result = await registerUser(req.server.jwt, req.body);
      return reply.code(201).send(result);
    },
  );

  r.post(
    '/login',
    {
      schema: {
        body: loginBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (req, reply) => {
      const result = await loginUser(req.server.jwt, req.body);
      return reply.send(result);
    },
  );

  r.post(
    '/refresh',
    {
      schema: {
        body: refreshBodySchema,
        response: { 200: tokenPairSchema },
      },
    },
    async (req, reply) => {
      const result = await refreshTokens(req.server.jwt, req.body.refreshToken);
      return reply.send(result);
    },
  );
};
