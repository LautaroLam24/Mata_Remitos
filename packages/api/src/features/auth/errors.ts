import { DomainError } from '../../shared/errors.js';

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS', 401);
  }
}

export class TenantSlugTakenError extends DomainError {
  constructor(slug: string) {
    super(`Tenant slug '${slug}' is already taken`, 'TENANT_SLUG_TAKEN', 409, { slug });
  }
}

export class InvalidTokenError extends DomainError {
  constructor() {
    super('Invalid or expired token', 'INVALID_TOKEN', 401);
  }
}
