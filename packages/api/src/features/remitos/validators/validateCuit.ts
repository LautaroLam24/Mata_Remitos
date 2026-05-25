const MULTIPLIERS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
// AFIP valid CUIT/CUIL type prefixes
const VALID_PREFIXES = new Set(['20', '23', '24', '27', '30', '33', '34']);

export function validateCuit(cuit: string): { valid: boolean; normalized?: string } {
  const clean = cuit.replace(/[^0-9]/g, '');
  if (clean.length !== 11) return { valid: false };
  if (!VALID_PREFIXES.has(clean.slice(0, 2))) return { valid: false };

  const sum = clean
    .slice(0, 10)
    .split('')
    .reduce((acc, digit, i) => acc + parseInt(digit) * MULTIPLIERS[i]!, 0);

  const mod = sum % 11;
  const expected = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;

  if (expected !== parseInt(clean[10]!)) return { valid: false };

  return {
    valid: true,
    normalized: `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`,
  };
}
