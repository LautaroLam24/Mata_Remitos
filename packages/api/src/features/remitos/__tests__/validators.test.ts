import { describe, it, expect, vi } from 'vitest';

// ─── validateCuit ─────────────────────────────────────────────────────────────
import { validateCuit } from '../validators/validateCuit.js';

// Verified CUITs (sum / mod / expected):
//   20-30678774-9 → sum=200, mod=2, expected=9 ✓
//   30-71034702-2 → sum=108, mod=9, expected=2 ✓
describe('validateCuit', () => {
  it('returns valid + normalized for a correct CUIT with dashes', () => {
    const result = validateCuit('20-30678774-9');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('20-30678774-9');
  });

  it('returns valid + normalized for digits-only input', () => {
    // 20-30678774-9 without dashes = 20306787749 (2+0+3+0+6+7+8+7+7+4+9)
    const result = validateCuit('20306787749');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('20-30678774-9');
  });

  it('returns invalid for wrong check digit', () => {
    expect(validateCuit('20-30678774-8').valid).toBe(false);
  });

  it('returns invalid for too few digits', () => {
    expect(validateCuit('2030678774').valid).toBe(false);
  });

  it('returns invalid for too many digits', () => {
    expect(validateCuit('203067877490').valid).toBe(false);
  });

  it('returns invalid for empty string', () => {
    expect(validateCuit('').valid).toBe(false);
  });

  it('handles 30-prefix legal entity CUIT 30-71034702-2', () => {
    const result = validateCuit('30-71034702-2');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('30-71034702-2');
  });

  it('returns invalid for all-zeros CUIT (invalid prefix 00)', () => {
    expect(validateCuit('00000000000').valid).toBe(false);
  });
});

// ─── validateConfidence ───────────────────────────────────────────────────────
import { validateConfidence } from '../validators/validateConfidence.js';
import type { ExtractionResult } from '../../ocr/schemas.js';

const baseExtraction: ExtractionResult = {
  documentType: 'remito',
  documentNumber: { value: 'R-001', confidence: 95 },
  date: { value: '2024-03-15', confidence: 95 },
  supplier: {
    cuit: { value: '20-30678774-9', confidence: 95 },
    name: { value: 'Test SA', confidence: 95 },
  },
  items: [{ code: { value: null, confidence: 90 }, description: { value: 'Harina', confidence: 95 }, quantity: { value: 10, confidence: 95 }, unit: { value: 'kg', confidence: 99 }, unitPrice: { value: null, confidence: 80 }, subtotal: { value: null, confidence: 80 } }],
  total: { value: null, confidence: 80 },
  rawText: '',
  overallConfidence: 95,
  warnings: [],
};

describe('validateConfidence', () => {
  it('returns shouldAutoProcess=true when all critical fields >= 85 and overall >= 85', () => {
    const result = validateConfidence(baseExtraction);
    expect(result.shouldAutoProcess).toBe(true);
  });

  it('returns shouldAutoProcess=false when overall confidence is below threshold', () => {
    const low = { ...baseExtraction, overallConfidence: 80 };
    const result = validateConfidence(low);
    expect(result.shouldAutoProcess).toBe(false);
  });

  it('returns shouldAutoProcess=false when a critical field confidence is below threshold', () => {
    const low: ExtractionResult = {
      ...baseExtraction,
      documentNumber: { value: 'R-001', confidence: 70 },
    };
    const result = validateConfidence(low);
    expect(result.shouldAutoProcess).toBe(false);
    expect(result.minCritical).toBe(70);
  });

  it('respects custom threshold', () => {
    const result = validateConfidence(baseExtraction, 96);
    expect(result.shouldAutoProcess).toBe(false);
  });

  it('exposes minCritical field correctly', () => {
    const extraction: ExtractionResult = {
      ...baseExtraction,
      supplier: { ...baseExtraction.supplier, cuit: { value: '20-30678774-9', confidence: 88 } },
    };
    const result = validateConfidence(extraction);
    expect(result.minCritical).toBe(88);
  });

  it('handles multiple items picking the lowest quantity confidence', () => {
    const extraction: ExtractionResult = {
      ...baseExtraction,
      items: [
        { ...baseExtraction.items[0], quantity: { value: 10, confidence: 90 } },
        { ...baseExtraction.items[0], quantity: { value: 5, confidence: 60 } },
      ],
    };
    const result = validateConfidence(extraction);
    expect(result.shouldAutoProcess).toBe(false);
    expect(result.minCritical).toBe(60);
  });
});

// ─── validateQuantity ─────────────────────────────────────────────────────────
import { validateQuantity } from '../validators/validateQuantity.js';

describe('validateQuantity', () => {
  it('returns valid for a normal positive quantity', () => {
    expect(validateQuantity(10).valid).toBe(true);
  });

  it('returns invalid for zero quantity', () => {
    const result = validateQuantity(0);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns invalid for negative quantity', () => {
    const result = validateQuantity(-5);
    expect(result.valid).toBe(false);
  });

  it('returns invalid for quantity above 100,000', () => {
    const result = validateQuantity(100001);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns valid with warning when quantity is 10x above typical max', () => {
    const result = validateQuantity(1001, { typicalRange: { min: 1, max: 100 } });
    expect(result.valid).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it('returns valid with warning when quantity is 10x below typical min', () => {
    const result = validateQuantity(0.05, { typicalRange: { min: 10, max: 100 } });
    expect(result.valid).toBe(true);
    expect(result.warning).toBeTruthy();
  });

  it('returns valid without warning when quantity is within typical range', () => {
    const result = validateQuantity(50, { typicalRange: { min: 1, max: 100 } });
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('returns valid without warning when product has no typicalRange', () => {
    const result = validateQuantity(999, { typicalRange: null });
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('allows 100,000 exactly', () => {
    expect(validateQuantity(100000).valid).toBe(true);
  });
});

// ─── matchProduct ─────────────────────────────────────────────────────────────
import { matchProduct } from '../validators/matchProduct.js';
import type { CatalogProduct } from '../validators/types.js';

const catalog: CatalogProduct[] = [
  { id: 'p1', name: 'Harina 0000 x 25kg', code: 'HAR-001', aliases: ['harina triple cero'] },
  { id: 'p2', name: 'Aceite Girasol 900ml', code: 'ACE-001', aliases: ['aceite girasol'] },
  { id: 'p3', name: 'Coca-Cola 500ml PET', code: 'COC-001', aliases: ['coca cola', 'cocacola'] },
];

describe('matchProduct', () => {
  it('matches by exact name', () => {
    const result = matchProduct('Harina 0000 x 25kg', catalog);
    expect(result).not.toBeNull();
    expect(result!.productId).toBe('p1');
    expect(result!.score).toBeGreaterThanOrEqual(80);
  });

  it('matches despite case difference', () => {
    const result = matchProduct('harina 0000 x 25kg', catalog);
    expect(result).not.toBeNull();
    expect(result!.productId).toBe('p1');
  });

  it('matches by alias', () => {
    const result = matchProduct('coca cola 500ml', catalog);
    expect(result).not.toBeNull();
    expect(result!.productId).toBe('p3');
  });

  it('returns null when no good match exists', () => {
    const result = matchProduct('Yerba Mate 1kg', catalog);
    expect(result).toBeNull();
  });

  it('returns null for empty catalog', () => {
    const result = matchProduct('Harina', []);
    expect(result).toBeNull();
  });

  it('matches by product code', () => {
    const result = matchProduct('HAR-001', catalog);
    expect(result).not.toBeNull();
    expect(result!.productId).toBe('p1');
  });

  it('rejects match that falls below a high custom threshold', () => {
    // "Aceite de Girasol" has "de" not in any catalog entry → can't be a perfect match
    // threshold=100 requires Fuse score=0 (perfect); the extra word prevents that
    const result = matchProduct('Aceite de Girasol', catalog, 100);
    expect(result).toBeNull();
  });

  it('returns score between 0 and 100', () => {
    const result = matchProduct('Aceite Girasol 900ml', catalog);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
  });
});

// ─── validateDuplicate ────────────────────────────────────────────────────────
import { validateDuplicate } from '../validators/validateDuplicate.js';
import type { PrismaClient } from '@prisma/client';

describe('validateDuplicate', () => {
  it('returns isDuplicate=false when no existing document found', async () => {
    const mockDb = {
      document: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const result = await validateDuplicate({
      tenantId: 'tenant-1',
      documentNumber: 'R-001',
      supplierCuit: '20-12345678-9',
      date: new Date('2024-03-15'),
      db: mockDb,
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.existingId).toBeUndefined();
  });

  it('returns isDuplicate=true with existingId when document already exists', async () => {
    const mockDb = {
      document: {
        findUnique: vi.fn().mockResolvedValue({ id: 'existing-doc-id' }),
      },
    } as unknown as PrismaClient;

    const result = await validateDuplicate({
      tenantId: 'tenant-1',
      documentNumber: 'R-001',
      supplierCuit: '20-12345678-9',
      date: new Date('2024-03-15'),
      db: mockDb,
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.existingId).toBe('existing-doc-id');
  });

  it('passes correct composite key to DB query', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const mockDb = { document: { findUnique } } as unknown as PrismaClient;

    await validateDuplicate({
      tenantId: 'tenant-abc',
      documentNumber: 'F-002',
      supplierCuit: '30-71034702-5',
      date: new Date('2024-06-01'),
      db: mockDb,
    });

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId_documentNumber_supplierCuit_date: expect.objectContaining({
            tenantId: 'tenant-abc',
            documentNumber: 'F-002',
            supplierCuit: '30-71034702-5',
          }),
        }),
      }),
    );
  });
});

// ─── resolveSupplier ──────────────────────────────────────────────────────────
import { resolveSupplier } from '../validators/resolveSupplier.js';

describe('resolveSupplier', () => {
  it('returns existing supplier when CUIT is found', async () => {
    const existing = { id: 'sup-1', cuit: '20-12345678-9', name: 'Test SA' };
    const mockDb = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue(existing),
      },
    } as unknown as PrismaClient;

    const result = await resolveSupplier({
      cuit: '20-12345678-9',
      name: 'Test SA',
      tenantId: 'tenant-1',
      db: mockDb,
    });

    expect(result.isNew).toBe(false);
    expect(result.supplier).toEqual(existing);
    expect(result.suggested).toBeUndefined();
  });

  it('returns isNew=true with suggested when CUIT not found — does NOT create', async () => {
    const mockDb = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const result = await resolveSupplier({
      cuit: '20-99999999-4',
      name: 'Proveedor Nuevo SRL',
      tenantId: 'tenant-1',
      db: mockDb,
    });

    expect(result.isNew).toBe(true);
    expect(result.supplier).toBeNull();
    expect(result.suggested).toEqual({ cuit: '20-99999999-4', name: 'Proveedor Nuevo SRL' });
  });

  it('queries DB with correct tenantId + cuit composite key', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const mockDb = { supplier: { findUnique } } as unknown as PrismaClient;

    await resolveSupplier({ cuit: '30-71034702-5', name: 'X', tenantId: 'tenant-abc', db: mockDb });

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_cuit: { tenantId: 'tenant-abc', cuit: '30-71034702-5' } },
      }),
    );
  });
});
