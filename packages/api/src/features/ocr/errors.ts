import { DomainError } from '../../shared/errors.js';

export class ImagePreprocessError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'IMAGE_PREPROCESS_ERROR', 422, details);
  }
}

export class ExtractionError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'EXTRACTION_ERROR', 422, details);
  }
}

export class ExtractionParseError extends DomainError {
  constructor(details?: Record<string, unknown>) {
    super('Model did not return valid JSON extraction', 'EXTRACTION_PARSE_ERROR', 422, details);
  }
}
