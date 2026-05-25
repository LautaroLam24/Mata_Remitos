import { DomainError } from '../../shared/errors.js';

export class ProductoNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Producto ${id} no encontrado`, 'NOT_FOUND', 404);
  }
}

export class ProductoConStockError extends DomainError {
  constructor(id: string, stock: number) {
    super(`No se puede archivar el producto ${id}: tiene stock ${stock}`, 'CONFLICT', 409);
  }
}

export class ProductoCodigoExisteError extends DomainError {
  constructor(code: string) {
    super(`Ya existe un producto con código ${code}`, 'CONFLICT', 409);
  }
}
