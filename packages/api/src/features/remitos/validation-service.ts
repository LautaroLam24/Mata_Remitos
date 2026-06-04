import { db } from '../../infrastructure/db.js';
import { validateCuit } from './validators/validateCuit.js';
import { validateQuantity } from './validators/validateQuantity.js';
import { DocumentNotFoundError } from './errors.js';

export type CheckStatus = 'passed' | 'warning' | 'failed';

export type ValidationCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  details: string | null;
};

export type ValidationResult = {
  checks: ValidationCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    canApprove: boolean;
    duplicateId?: string;
  };
};

function extractTypicalRange(typicalRange: unknown): { min: number; max: number } | undefined {
  if (!typicalRange || typeof typicalRange !== 'object' || Array.isArray(typicalRange)) {
    return undefined;
  }
  const tr = typicalRange as Record<string, unknown>;
  if (typeof tr['min'] === 'number' && typeof tr['max'] === 'number') {
    return { min: tr['min'], max: tr['max'] };
  }
  return undefined;
}

const CRITICAL_FAIL_IDS = new Set(['cuit_format', 'duplicate_check']);

export async function runValidations(params: {
  id: string;
  tenantId: string;
}): Promise<ValidationResult> {
  const { id, tenantId } = params;

  const doc = await db.document.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      items: {
        where: { deletedAt: null },
        include: { product: { select: { typicalRange: true } } },
      },
    },
  });

  if (!doc) throw new DocumentNotFoundError(id);

  const checks: ValidationCheck[] = [];
  let duplicateId: string | undefined;

  // 1. cuit_format — formato y dígito verificador del CUIT del proveedor
  const cuitResult = validateCuit(doc.supplierCuit);
  checks.push({
    id: 'cuit_format',
    label: 'Formato de CUIT del proveedor',
    status: cuitResult.valid ? 'passed' : 'failed',
    message: cuitResult.valid
      ? `CUIT ${cuitResult.normalized ?? doc.supplierCuit} válido`
      : `CUIT ${doc.supplierCuit} inválido — dígito verificador incorrecto`,
    details: null,
  });

  // 2. confidence_overall — confianza global del documento
  const conf = doc.overallConfidence;
  checks.push({
    id: 'confidence_overall',
    label: 'Confianza general de extracción IA',
    status: conf >= 85 ? 'passed' : conf >= 70 ? 'warning' : 'failed',
    message:
      conf >= 85
        ? `Confianza alta (${conf}%)`
        : conf >= 70
          ? `Confianza media (${conf}%) — revisá los campos críticos`
          : `Confianza baja (${conf}%) — revisión manual recomendada`,
    details: null,
  });

  // 3. items_match_total — coherencia entre suma de items y total declarado
  const rawEx = (doc.rawExtraction as unknown) as { total?: { value: number | null } } | null;
  const declaredTotal = rawEx?.total?.value ?? null;

  let totalStatus: CheckStatus = 'passed';
  let totalMsg = 'Sin total declarado en el documento';
  let totalDetails: string | null = null;

  if (declaredTotal != null && declaredTotal > 0) {
    const itemsWithPrice = doc.items.filter((i) => i.unitPrice != null);
    if (itemsWithPrice.length > 0) {
      const computed = itemsWithPrice.reduce(
        (sum, i) => sum + Number(i.quantity) * Number(i.unitPrice!),
        0,
      );
      const diff = Math.abs(computed - declaredTotal);
      if (diff <= 1) {
        totalStatus = 'passed';
        totalMsg = `Suma de items ($${computed.toFixed(2)}) coincide con total declarado ($${declaredTotal.toFixed(2)})`;
      } else {
        totalStatus = 'warning';
        totalMsg = `Diferencia de $${diff.toFixed(2)} entre suma de items y total`;
        totalDetails = `Items: $${computed.toFixed(2)} — Declarado: $${declaredTotal.toFixed(2)}`;
      }
    } else {
      totalStatus = 'warning';
      totalMsg = `Total declarado $${declaredTotal.toFixed(2)}, pero los items no tienen precio unitario`;
    }
  }

  checks.push({
    id: 'items_match_total',
    label: 'Coherencia de totales',
    status: totalStatus,
    message: totalMsg,
    details: totalDetails,
  });

  // 4. duplicate_check — buscar otro documento con mismos datos (excluye el actual)
  const duplicate = await db.document.findFirst({
    where: {
      tenantId,
      documentNumber: doc.documentNumber,
      supplierCuit: doc.supplierCuit,
      date: doc.date,
      id: { not: id },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (duplicate) duplicateId = duplicate.id;

  checks.push({
    id: 'duplicate_check',
    label: 'Detección de duplicados',
    status: duplicate ? 'failed' : 'passed',
    message: duplicate
      ? 'Ya existe un comprobante con el mismo proveedor, número y fecha'
      : 'No se encontraron duplicados',
    details: duplicate ? `ID del duplicado: ${duplicate.id}` : null,
  });

  // 5. items_matched — proporción de items resueltos (matched o new_product)
  const totalItemCount = doc.items.length;
  const matchedCount = doc.items.filter(
    (i) => i.matchStatus === 'matched' || i.matchStatus === 'new_product',
  ).length;
  const matchPct = totalItemCount > 0 ? Math.round((matchedCount / totalItemCount) * 100) : 100;

  checks.push({
    id: 'items_matched',
    label: 'Productos identificados en catálogo',
    status: totalItemCount === 0 ? 'warning' : matchPct >= 80 ? 'passed' : 'warning',
    message:
      totalItemCount === 0
        ? 'No hay items en el documento'
        : `${matchedCount} de ${totalItemCount} productos identificados (${matchPct}%)`,
    details:
      matchPct < 80 && totalItemCount > 0
        ? `${totalItemCount - matchedCount} producto(s) sin asignar al catálogo`
        : null,
  });

  // 6. document_date — fecha futura o muy antigua (>1 año)
  const docDate = new Date(doc.date);
  const now = new Date();
  const daysDiff = Math.round((now.getTime() - docDate.getTime()) / 86_400_000);

  let dateStatus: CheckStatus = 'passed';
  let dateMsg = `Fecha ${docDate.toLocaleDateString('es-AR')} válida`;
  let dateDetails: string | null = null;

  if (daysDiff < 0) {
    dateStatus = 'warning';
    dateMsg = `Fecha futura (${Math.abs(daysDiff)} día(s) por delante)`;
    dateDetails = 'Verificá que la fecha del documento sea correcta';
  } else if (daysDiff > 365) {
    dateStatus = 'warning';
    dateMsg = `Fecha antigua (${daysDiff} días atrás)`;
    dateDetails = 'El documento tiene más de un año de antigüedad';
  }

  checks.push({
    id: 'document_date',
    label: 'Validez de la fecha del documento',
    status: dateStatus,
    message: dateMsg,
    details: dateDetails,
  });

  // 7. items_quantity — cantidades fuera del rango típico del producto matcheado
  const qtyWarnings: string[] = [];
  for (const item of doc.items) {
    const qty = Number(item.quantity);
    const typicalRange = extractTypicalRange(item.product?.typicalRange);
    const qtyResult = validateQuantity(qty, typicalRange ? { typicalRange } : undefined);
    if (qtyResult.warning) {
      qtyWarnings.push(`"${item.rawDescription}": ${qtyResult.warning}`);
    }
    if (!qtyResult.valid && qtyResult.reason) {
      qtyWarnings.push(`"${item.rawDescription}": ${qtyResult.reason}`);
    }
  }

  checks.push({
    id: 'items_quantity',
    label: 'Cantidades dentro del rango habitual',
    status: qtyWarnings.length > 0 ? 'warning' : 'passed',
    message:
      qtyWarnings.length > 0
        ? `${qtyWarnings.length} item(s) con cantidades inusuales`
        : 'Todas las cantidades están dentro del rango habitual',
    details: qtyWarnings.length > 0 ? qtyWarnings.slice(0, 3).join('; ') : null,
  });

  const passed = checks.filter((c) => c.status === 'passed').length;
  const warnings = checks.filter((c) => c.status === 'warning').length;
  const failed = checks.filter((c) => c.status === 'failed').length;
  const hasCriticalFail = checks.some(
    (c) => c.status === 'failed' && CRITICAL_FAIL_IDS.has(c.id),
  );

  return {
    checks,
    summary: {
      passed,
      warnings,
      failed,
      canApprove: !hasCriticalFail,
      ...(duplicateId !== undefined ? { duplicateId } : {}),
    },
  };
}
