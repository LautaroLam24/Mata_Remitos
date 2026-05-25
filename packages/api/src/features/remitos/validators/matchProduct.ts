import Fuse from 'fuse.js';
import type { CatalogProduct } from './types.js';

const DEFAULT_THRESHOLD = 80;

export function matchProduct(
  extractedDescription: string,
  catalogProducts: CatalogProduct[],
  threshold = DEFAULT_THRESHOLD,
): { productId: string; score: number } | null {
  if (catalogProducts.length === 0) return null;

  const fuse = new Fuse(catalogProducts, {
    keys: ['name', 'code', 'aliases'],
    threshold: 0.4, // fuse: 0 = exact, 1 = anything
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });

  const results = fuse.search(extractedDescription);
  const best = results[0];
  if (!best) return null;

  const score = Math.round((1 - (best.score ?? 1)) * 100);

  if (score < threshold) return null;

  return { productId: best.item.id, score };
}
