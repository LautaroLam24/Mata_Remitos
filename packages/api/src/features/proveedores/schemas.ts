import { z } from 'zod';

export const proveedorListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

export const proveedorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  cuit: z.string().min(11).max(13),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const proveedorUpdateSchema = proveedorCreateSchema.partial();

const proveedorResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuit: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
});

export const proveedorListResponseSchema = z.object({
  items: z.array(proveedorResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type ProveedorListQuery = z.infer<typeof proveedorListQuerySchema>;
export type ProveedorCreate = z.infer<typeof proveedorCreateSchema>;
export type ProveedorUpdate = z.infer<typeof proveedorUpdateSchema>;
