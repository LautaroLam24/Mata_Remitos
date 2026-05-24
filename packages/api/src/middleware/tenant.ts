import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../infrastructure/db.js';
import { ForbiddenError } from '../shared/errors.js';

export async function requireTenant(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const { tenantId } = req.user;

  // Validate tenantId format before raw SQL interpolation
  if (!/^[a-z0-9]+$/.test(tenantId)) {
    throw new ForbiddenError('Invalid tenant context');
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, plan: true, config: true, deletedAt: true },
  });

  if (!tenant || tenant.deletedAt !== null) {
    throw new ForbiddenError('Tenant not found or inactive');
  }

  // Set RLS context for this connection session.
  // Uses set_config() with is_local=false (session-scoped) to support parameterized queries.
  await db.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;

  req.tenant = {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    plan: tenant.plan,
    config: tenant.config,
  };
}
