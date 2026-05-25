import { z } from 'zod';

export const uploadResponseSchema = z.object({
  jobId: z.string(),
  imageKey: z.string(),
  message: z.string(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

// ─── Review queue ─────────────────────────────────────────────────────────────

export const reviewQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const reviewQueueItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  supplierId: z.string(),
  supplierCuit: z.string(),
  type: z.string(),
  documentNumber: z.string(),
  date: z.coerce.date(),
  overallConfidence: z.number(),
  warnings: z.array(z.string()),
  imageUrl: z.string(),
  imageThumbnailUrl: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const reviewQueueResponseSchema = z.object({
  items: z.array(reviewQueueItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

// ─── Document detail ──────────────────────────────────────────────────────────

const documentItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  documentId: z.string(),
  productId: z.string().nullable(),
  rawDescription: z.string(),
  quantity: z.coerce.number(),
  unit: z.string(),
  unitPrice: z.coerce.number().nullable(),
  confidenceScore: z.number().nullable(),
  matchScore: z.number().nullable(),
  matchStatus: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const documentDetailResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  supplierId: z.string(),
  supplierCuit: z.string(),
  type: z.string(),
  documentNumber: z.string(),
  date: z.coerce.date(),
  status: z.string(),
  overallConfidence: z.number(),
  warnings: z.array(z.string()),
  imageUrl: z.string(),
  imageThumbnailUrl: z.string().nullable(),
  uploadedById: z.string(),
  approvedById: z.string().nullable(),
  approvedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  items: z.array(documentItemSchema),
});

// ─── Approve / reject ────────────────────────────────────────────────────────

export const rejectBodySchema = z.object({
  reason: z.string().optional(),
});

export const approveResponseSchema = z.object({
  id: z.string(),
  status: z.literal('approved'),
  movementsCreated: z.number(),
});

export const rejectResponseSchema = z.object({
  id: z.string(),
  status: z.literal('rejected'),
});
