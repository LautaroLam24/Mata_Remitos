import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../shared/errors.js';

export async function authenticate(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  if (req.user.type !== 'access') {
    throw new UnauthorizedError('Invalid token type');
  }
}
