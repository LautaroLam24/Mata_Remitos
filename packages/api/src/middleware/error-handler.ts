import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../shared/errors.js';

export function errorHandler(
  error: FastifyError,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof DomainError) {
    void reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  // Fastify validation error (Zod)
  if (error.statusCode === 400 && error.validation) {
    void reply.code(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: error.validation,
    });
    return;
  }

  req.log.error({ err: error, requestId: req.id }, 'Unhandled error');
  void reply.code(500).send({
    error: 'INTERNAL_ERROR',
    message: 'An internal error occurred',
    requestId: req.id,
  });
}
