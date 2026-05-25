type QuantityResult = { valid: boolean; reason?: string; warning?: string };

export function validateQuantity(
  qty: number,
  product?: { typicalRange?: { min: number; max: number } | null },
): QuantityResult {
  if (qty <= 0) return { valid: false, reason: 'Cantidad debe ser positiva' };
  if (qty > 100_000) return { valid: false, reason: 'Cantidad sospechosamente alta' };

  if (product?.typicalRange) {
    const { min, max } = product.typicalRange;
    if (qty < min * 0.1 || qty > max * 10) {
      return {
        valid: true,
        warning: `Cantidad ${qty} está fuera del rango habitual (${min}-${max})`,
      };
    }
  }

  return { valid: true };
}
