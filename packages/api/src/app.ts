import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { config } from './shared/config.js';
import { loggerConfig } from './shared/logger.js';
import { authenticate } from './middleware/auth.js';
import { requireTenant } from './middleware/tenant.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './features/auth/routes.js';
import { remitoRoutes } from './features/remitos/routes.js';
import { productosRoutes } from './features/productos/routes.js';
import { proveedoresRoutes } from './features/proveedores/routes.js';
import { stockRoutes } from './features/stock/routes.js';
import { dashboardRoutes } from './features/dashboard/routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: loggerConfig,
    genReqId: () => crypto.randomUUID(),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyJwt, { secret: config.JWT_SECRET });
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyHelmet);
  await app.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  app.decorate('authenticate', authenticate);
  app.decorate('requireTenant', requireTenant);
  app.setErrorHandler(errorHandler);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(remitoRoutes, { prefix: '/api/remitos' });
  await app.register(productosRoutes, { prefix: '/api/productos' });
  await app.register(proveedoresRoutes, { prefix: '/api/proveedores' });
  await app.register(stockRoutes, { prefix: '/api/stock' });
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

  return app;
}
