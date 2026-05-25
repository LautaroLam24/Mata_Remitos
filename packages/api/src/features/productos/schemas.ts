import { z } from 'zod';

export const productoListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  lowStock: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export const productoCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(50),
  minStock: z.number().nonnegative().nullable().default(null),
  stockOnHand: z.number().nonnegative().default(0),
  aliases: z.array(z.string()).default([]),
});

export const productoUpdateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(50).optional(),
  minStock: z.number().nonnegative().nullable().optional(),
  aliases: z.array(z.string()).optional(),
});

const productoResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  stockOnHand: z.number(),
  minStock: z.number().nullable(),
  aliases: z.array(z.string()),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const productoListResponseSchema = z.object({
  items: z.array(productoResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export const productoDetailResponseSchema = productoResponseSchema.extend({
  stockMovements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      reason: z.string(),
      reference: z.string().nullable(),
      quantity: z.number(),
      balanceBefore: z.number(),
      balanceAfter: z.number(),
      createdAt: z.string(),
      user: z.object({ name: z.string(), email: z.string() }),
    }),
  ),
});

export type ProductoListQuery = z.infer<typeof productoListQuerySchema>;
export type ProductoCreate = z.infer<typeof productoCreateSchema>;
export type ProductoUpdate = z.infer<typeof productoUpdateSchema>;
