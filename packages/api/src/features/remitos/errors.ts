import { DomainError } from '../../shared/errors.js';

export class DuplicateDocumentError extends DomainError {
  constructor(params: { documentNumber: string; supplierCuit: string; existingId: string }) {
    super(
      `Documento duplicado: ${params.documentNumber} del proveedor ${params.supplierCuit} ya existe`,
      'DUPLICATE_DOCUMENT',
      409,
      params,
    );
  }
}

export class LowConfidenceError extends DomainError {
  constructor(params: { overallConfidence: number; minCritical: number; threshold: number }) {
    super(
      `Confianza insuficiente para auto-procesamiento (overall: ${params.overallConfidence}, mínimo crítico: ${params.minCritical}, umbral: ${params.threshold})`,
      'LOW_CONFIDENCE',
      422,
      params,
    );
  }
}

export class InvalidFileTypeError extends DomainError {
  constructor(mimeType: string) {
    super(
      `Invalid file type: ${mimeType}. Only JPEG and PNG are accepted.`,
      'INVALID_FILE_TYPE',
      415,
      { mimeType },
    );
  }
}

export class FileTooLargeError extends DomainError {
  constructor(sizeBytes: number) {
    super(
      `File too large: ${sizeBytes} bytes. Maximum is 10MB.`,
      'FILE_TOO_LARGE',
      413,
      { sizeBytes },
    );
  }
}

export class DocumentNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Document ${id} not found`, 'DOCUMENT_NOT_FOUND', 404, { id });
  }
}

export class DocumentItemNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Ítem ${id} no encontrado`, 'DOCUMENT_ITEM_NOT_FOUND', 404, { id });
  }
}

export class UnresolvedItemsError extends DomainError {
  constructor(count: number) {
    super(
      `Tenés ${count} ítem${count === 1 ? '' : 's'} sin asignar. Resolvé todos antes de confirmar.`,
      'UNRESOLVED_ITEMS',
      422,
      { count },
    );
  }
}
