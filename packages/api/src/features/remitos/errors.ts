import { DomainError } from '../../shared/errors.js';

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
