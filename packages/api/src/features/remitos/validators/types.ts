export type ValidationFieldError = {
  field: string;
  reason: string;
  existingId?: string;
};

export type ValidationWarning = {
  field: string;
  reason: string;
};

export type MatchedItem = {
  rawDescription: string;
  quantity: number;
  unit: string;
  productId: string | null;
  score: number | null;
  matchStatus: 'matched' | 'new_product' | 'pending';
};

export type SupplierResolution = {
  supplier: { id: string; cuit: string; name: string } | null;
  isNew: boolean;
  suggested?: { cuit: string; name: string };
};

export type ValidationOutcome = {
  isValid: boolean;
  requiresReview: boolean;
  errors: ValidationFieldError[];
  warnings: ValidationWarning[];
  matchedItems: MatchedItem[];
  supplierResolution: SupplierResolution;
};

export type CatalogProduct = {
  id: string;
  name: string;
  code: string;
  aliases: string[];
  typicalRange?: { min: number; max: number } | null;
};
