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

export const documentItemSchema = z.object({
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
  humanEdited: z.boolean(),
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
  rawExtraction: z.unknown(),
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

// ─── Document list ────────────────────────────────────────────────────────────

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['all', 'processing', 'review_needed', 'approved', 'rejected'])
    .default('all'),
  supplierId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});

export const documentListItemSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  type: z.string(),
  date: z.string(),
  status: z.string(),
  overallConfidence: z.number(),
  itemCount: z.number(),
  supplierName: z.string(),
  supplierCuit: z.string(),
  createdAt: z.string(),
});

export const documentListResponseSchema = z.object({
  items: z.array(documentListItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

// ─── Validations ─────────────────────────────────────────────────────────────

const checkStatusSchema = z.enum(['passed', 'warning', 'failed']);

const validationCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: checkStatusSchema,
  message: z.string(),
  details: z.string().nullable(),
});

export const validationsResponseSchema = z.object({
  checks: z.array(validationCheckSchema),
  summary: z.object({
    passed: z.number(),
    warnings: z.number(),
    failed: z.number(),
    canApprove: z.boolean(),
    duplicateId: z.string().optional(),
  }),
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

// ─── Item resolution — nuevos endpoints ──────────────────────────────────────

export const updateItemBodySchema = z.object({
  rawDescription: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
});

export const createProductFromItemBodySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  minStock: z.number().min(0).nullable().optional(),
});

export const associateProductBodySchema = z.object({
  productId: z.string().min(1),
});

export const createAllUnmatchedResponseSchema = z.object({
  created: z.number(),
  items: z.array(documentItemSchema),
});

export const createProductFromItemResponseSchema = z.object({
  productId: z.string(),
  item: documentItemSchema,
});
