import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { ExtractionResult } from '../../ocr/schemas.js';
import type { CatalogProduct } from '../validators/types.js';
import { validateDocument } from '../validators/index.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CUIT = '20-30678774-9'; // sum=200, mod=2, expected=9

const validExtraction: ExtractionResult = {
  documentType: 'remito',
  documentNumber: { value: 'R-001-00000001', confidence: 95 },
  date: { value: '2024-03-15', confidence: 95 },
  supplier: {
    cuit: { value: VALID_CUIT, confidence: 95 },
    name: { value: 'Distribuidora Test SA', confidence: 95 },
  },
  items: [
    {
      code: { value: null, confidence: 90 },
      description: { value: 'Harina 0000 x 25kg', confidence: 95 },
      quantity: { value: 10, confidence: 95 },
      unit: { value: 'kg', confidence: 99 },
      unitPrice: { value: null, confidence: 80 },
      subtotal: { value: null, confidence: 80 },
    },
  ],
  total: { value: null, confidence: 80 },
  rawText: '',
  overallConfidence: 95,
  warnings: [],
};

const catalog: CatalogProduct[] = [
  { id: 'p1', name: 'Harina 0000 x 25kg', code: 'HAR-001', aliases: ['harina triple cero'] },
];

function makeDb(overrides: { documentFindUnique?: unknown; supplierFindUnique?: unknown } = {}) {
  return {
    document: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.documentFindUnique !== undefined ? overrides.documentFindUnique : null,
      ),
    },
    supplier: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.supplierFindUnique !== undefined
          ? overrides.supplierFindUnique
          : { id: 'sup-1', cuit: VALID_CUIT, name: 'Test SA' },
      ),
    },
  } as unknown as PrismaClient;
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('validateDocument — happy path', () => {
  it('returns isValid=true, requiresReview=false for a clean extraction', async () => {
    const result = await validateDocument({
      extraction: validExtraction,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb(),
    });

    expect(result.isValid).toBe(true);
    expect(result.requiresReview).toBe(false);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('matches catalog product for the first item', async () => {
    const result = await validateDocument({
      extraction: validExtraction,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb(),
    });

    expect(result.matchedItems[0].productId).toBe('p1');
    expect(result.matchedItems[0].matchStatus).toBe('matched');
  });

  it('resolves existing supplier correctly', async () => {
    const result = await validateDocument({
      extraction: validExtraction,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb(),
    });

    expect(result.supplierResolution.isNew).toBe(false);
    expect(result.supplierResolution.supplier?.id).toBe('sup-1');
  });
});

// ─── CUIT validation ──────────────────────────────────────────────────────────

describe('validateDocument — CUIT error', () => {
  it('returns isValid=false with cuit error when CUIT is invalid', async () => {
    const badExtraction: ExtractionResult = {
      ...validExtraction,
      supplier: {
        ...validExtraction.supplier,
        cuit: { value: '20-00000000-0', confidence: 95 }, // invalid check digit
      },
    };

    const result = await validateDocument({
      extraction: badExtraction,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb(),
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'supplier.cuit')).toBe(true);
  });
});

// ─── Duplicate detection ──────────────────────────────────────────────────────

describe('validateDocument — duplicate', () => {
  it('returns isValid=false with duplicate error when document already exists', async () => {
    const result = await validateDocument({
      extraction: validExtraction,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb({ documentFindUnique: { id: 'existing-doc' } }),
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'document' && e.existingId === 'existing-doc')).toBe(true);
  });
});

// ─── Low confidence ───────────────────────────────────────────────────────────

describe('validateDocument — low confidence', () => {
  it('returns requiresReview=true (warning) when overall confidence is below 85', async () => {
    const lowConfidence: ExtractionResult = {
      ...validExtraction,
      overallConfidence: 70,
    };

    const result = await validateDocument({
      extraction: lowConfidence,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb(),
    });

    expect(result.isValid).toBe(true); // warnings don't block
    expect(result.requiresReview).toBe(true);
    expect(result.warnings.some((w) => w.field === 'overall')).toBe(true);
  });

  it('does NOT block processing — low confidence is a warning, not an error', async () => {
    const lowConfidence: ExtractionResult = {
      ...validExtraction,
      overallConfidence: 50,
    };

    const result = await validateDocument({
      extraction: lowConfidence,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb(),
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── New supplier ─────────────────────────────────────────────────────────────

describe('validateDocument — new supplier', () => {
  it('adds supplier warning and sets requiresReview=true when supplier is new', async () => {
    const result = await validateDocument({
      extraction: validExtraction,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb({ supplierFindUnique: null }),
    });

    expect(result.isValid).toBe(true);
    expect(result.requiresReview).toBe(true);
    expect(result.supplierResolution.isNew).toBe(true);
    expect(result.warnings.some((w) => w.field === 'supplier')).toBe(true);
  });
});

// ─── Unmatched product ────────────────────────────────────────────────────────

describe('validateDocument — unmatched product', () => {
  it('returns item with matchStatus=new_product when description does not match catalog', async () => {
    const extractionWithUnknown: ExtractionResult = {
      ...validExtraction,
      items: [
        {
          ...validExtraction.items[0],
          description: { value: 'Yerba Mate 1kg', confidence: 95 },
        },
      ],
    };

    const result = await validateDocument({
      extraction: extractionWithUnknown,
      tenantId: 'tenant-1',
      catalog,
      db: makeDb(),
    });

    expect(result.matchedItems[0].matchStatus).toBe('new_product');
    expect(result.matchedItems[0].productId).toBeNull();
    expect(result.requiresReview).toBe(true);
  });
});
