import type { PrismaClient } from '@prisma/client';

export async function validateDuplicate(params: {
  tenantId: string;
  documentNumber: string;
  supplierCuit: string;
  date: Date;
  db: PrismaClient;
}): Promise<{ isDuplicate: boolean; existingId?: string }> {
  const { tenantId, documentNumber, supplierCuit, date, db } = params;

  const existing = await db.document.findUnique({
    where: {
      tenantId_documentNumber_supplierCuit_date: {
        tenantId,
        documentNumber,
        supplierCuit,
        date,
      },
    },
    select: { id: true },
  });

  if (!existing) return { isDuplicate: false };

  return { isDuplicate: true, existingId: existing.id };
}
