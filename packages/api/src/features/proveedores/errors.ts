import { DomainError } from '../../shared/errors.js';

export class ProveedorNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Proveedor ${id} no encontrado`, 'NOT_FOUND', 404);
  }
}

export class ProveedorCuitExisteError extends DomainError {
  constructor(cuit: string) {
    super(`Ya existe un proveedor con CUIT ${cuit}`, 'CONFLICT', 409);
  }
}

export class CuitInvalidoError extends DomainError {
  constructor(cuit: string) {
    super(`CUIT inválido: ${cuit}`, 'VALIDATION_ERROR', 422);
  }
}
