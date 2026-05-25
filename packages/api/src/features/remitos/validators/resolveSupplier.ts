import type { PrismaClient } from '@prisma/client';
import type { SupplierResolution } from './types.js';

export async function resolveSupplier(params: {
  cuit: string;
  name: string;
  tenantId: string;
  db: PrismaClient;
}): Promise<SupplierResolution> {
  const { cuit, name, tenantId, db } = params;

  const existing = await db.supplier.findUnique({
    where: { tenantId_cuit: { tenantId, cuit } },
    select: { id: true, cuit: true, name: true },
  });

  if (existing) {
    return { supplier: existing, isNew: false };
  }

  return {
    supplier: null,
    isNew: true,
    suggested: { cuit, name },
  };
}
