import type { ExtractionResult } from '../../ocr/schemas.js';

const DEFAULT_THRESHOLD = 85;

export function validateConfidence(
  extraction: ExtractionResult,
  threshold = DEFAULT_THRESHOLD,
): { shouldAutoProcess: boolean; minCritical: number } {
  const criticalConfidences = [
    extraction.documentNumber.confidence,
    extraction.date.confidence,
    extraction.supplier.cuit.confidence,
    ...extraction.items.map((i) => i.quantity.confidence),
  ];

  const minCritical = Math.min(...criticalConfidences);

  const shouldAutoProcess =
    extraction.overallConfidence >= threshold && minCritical >= threshold;

  return { shouldAutoProcess, minCritical };
}
