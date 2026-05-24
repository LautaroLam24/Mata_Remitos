import { z } from 'zod';

const confidenceField = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    confidence: z.number().int().min(0).max(100),
  });

export const extractionItemSchema = z.object({
  code: confidenceField(z.string().nullable()),
  description: confidenceField(z.string()),
  quantity: confidenceField(z.number()),
  unit: confidenceField(z.string()),
  unitPrice: confidenceField(z.number().nullable()),
  subtotal: confidenceField(z.number().nullable()),
});

export const extractionResultSchema = z.object({
  documentType: z.enum([
    'remito',
    'factura_a',
    'factura_b',
    'factura_c',
    'nota_pedido',
    'desconocido',
  ]),
  documentNumber: confidenceField(z.string()),
  date: confidenceField(z.string()),
  supplier: z.object({
    cuit: confidenceField(z.string()),
    name: confidenceField(z.string()),
  }),
  items: z.array(extractionItemSchema),
  total: confidenceField(z.number().nullable()),
  rawText: z.string(),
  overallConfidence: z.number().int().min(0).max(100),
  warnings: z.array(z.string()),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractionItem = z.infer<typeof extractionItemSchema>;
