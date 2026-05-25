import { z } from 'zod';

const stockProductSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  stockOnHand: z.number(),
  minStock: z.number().nullable(),
});

export const stockAlertsResponseSchema = z.object({
  critical: z.array(stockProductSchema), // stockOnHand <= 0
  atRisk: z.array(stockProductSchema),   // 0 < stockOnHand < minStock
});
