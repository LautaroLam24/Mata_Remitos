import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    // `user` is provided by @fastify/jwt based on FastifyJWT.user below
    tenant: {
      id: string;
      slug: string;
      name: string;
      plan: string;
      config: unknown;
    };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTenant: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Defines shape of req.user and JWT payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      tenantId: string;
      email: string;
      role: string;
      type: 'access' | 'refresh';
    };
    user: {
      sub: string;
      tenantId: string;
      email: string;
      role: string;
      type: 'access' | 'refresh';
    };
  }
}
