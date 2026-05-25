import type { PrismaClient } from '@prisma/client';
import type { ExtractionResult } from '../../ocr/schemas.js';
import type { CatalogProduct, MatchedItem, ValidationOutcome } from './types.js';
import { validateCuit } from './validateCuit.js';
import { validateDuplicate } from './validateDuplicate.js';
import { validateConfidence } from './validateConfidence.js';
import { validateQuantity } from './validateQuantity.js';
import { matchProduct } from './matchProduct.js';
import { resolveSupplier } from './resolveSupplier.js';

export { validateCuit, validateDuplicate, validateConfidence, validateQuantity, matchProduct, resolveSupplier };
export type { ValidationOutcome, CatalogProduct };

export async function validateDocument(params: {
  extraction: ExtractionResult;
  tenantId: string;
  catalog: CatalogProduct[];
  db: PrismaClient;
}): Promise<ValidationOutcome> {
  const { extraction, tenantId, catalog, db } = params;

  const errors: ValidationOutcome['errors'] = [];
  const warnings: ValidationOutcome['warnings'] = [];

  // 1. CUIT validation
  const cuitCheck = validateCuit(extraction.supplier.cuit.value);
  if (!cuitCheck.valid) {
    errors.push({ field: 'supplier.cuit', reason: 'CUIT inválido' });
  }

  // 2. Duplicate detection
  const date = new Date(extraction.date.value);
  const dupCheck = await validateDuplicate({
    tenantId,
    documentNumber: extraction.documentNumber.value,
    supplierCuit: extraction.supplier.cuit.value,
    date,
    db,
  });
  if (dupCheck.isDuplicate) {
    errors.push({
      field: 'document',
      reason: 'Documento duplicado',
      ...(dupCheck.existingId !== undefined && { existingId: dupCheck.existingId }),
    });
  }

  // 3. Item matching + quantity validation
  const matchedItems: MatchedItem[] = extraction.items.map((item) => {
    const match = matchProduct(item.description.value, catalog);
    const qtyResult = validateQuantity(item.quantity.value);

    if (!qtyResult.valid) {
      errors.push({ field: 'items.quantity', reason: qtyResult.reason ?? 'Cantidad inválida' });
    }
    if (qtyResult.warning) {
      warnings.push({ field: 'items.quantity', reason: qtyResult.warning });
    }

    if (match) {
      return {
        rawDescription: item.description.value,
        quantity: item.quantity.value,
        unit: item.unit.value,
        productId: match.productId,
        score: match.score,
        matchStatus: 'matched',
      };
    }

    warnings.push({ field: 'items', reason: `Producto no encontrado en catálogo: "${item.description.value}"` });
    return {
      rawDescription: item.description.value,
      quantity: item.quantity.value,
      unit: item.unit.value,
      productId: null,
      score: null,
      matchStatus: 'new_product',
    };
  });

  // 4. Confidence threshold
  const confidenceCheck = validateConfidence(extraction);
  if (!confidenceCheck.shouldAutoProcess) {
    warnings.push({ field: 'overall', reason: 'Confianza insuficiente para auto-procesamiento, requiere revisión humana' });
  }

  // 5. Supplier resolution
  const supplierResolution = await resolveSupplier({
    cuit: extraction.supplier.cuit.value,
    name: extraction.supplier.name.value,
    tenantId,
    db,
  });
  if (supplierResolution.isNew) {
    warnings.push({ field: 'supplier', reason: 'Proveedor nuevo detectado, requiere confirmación' });
  }

  return {
    isValid: errors.length === 0,
    requiresReview: warnings.length > 0,
    errors,
    warnings,
    matchedItems,
    supplierResolution,
  };
}
