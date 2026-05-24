import { hash, compare } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/db.js';
import { InvalidCredentialsError, TenantSlugTakenError, InvalidTokenError } from './errors.js';
import type { RegisterBody, LoginBody } from './schemas.js';

interface JwtUtils {
  sign(
    payload: Record<string, unknown>,
    options: { expiresIn: string },
  ): string;
  verify<T>(token: string): T;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse extends TokenPair {
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; slug: string; name: string };
}

interface RefreshPayload {
  sub: string;
  tenantId: string;
  type: string;
}

function issueTokens(
  jwt: JwtUtils,
  payload: { sub: string; tenantId: string; email: string; role: string },
): TokenPair {
  const accessToken = jwt.sign(
    { sub: payload.sub, tenantId: payload.tenantId, email: payload.email, role: payload.role, type: 'access' },
    { expiresIn: '15m' },
  );
  const refreshToken = jwt.sign(
    { sub: payload.sub, tenantId: payload.tenantId, type: 'refresh' },
    { expiresIn: '7d' },
  );
  return { accessToken, refreshToken };
}

export async function registerUser(
  jwt: JwtUtils,
  body: RegisterBody,
): Promise<AuthResponse> {
  const passwordHash = await hash(body.ownerPassword, 10);

  const { tenant, owner } = await db.$transaction(async (tx) => {
    const existingTenant = await tx.tenant.findUnique({
      where: { slug: body.tenantSlug },
      select: { id: true },
    });
    if (existingTenant) {
      throw new TenantSlugTakenError(body.tenantSlug);
    }

    const newTenant = await tx.tenant.create({
      data: {
        slug: body.tenantSlug,
        name: body.tenantName,
        plan: 'starter',
        config: {},
      },
      select: { id: true, slug: true, name: true },
    });

    const newOwner = await tx.user.create({
      data: {
        tenantId: newTenant.id,
        email: body.ownerEmail,
        name: body.ownerName,
        passwordHash,
        role: 'owner',
        phone: body.ownerPhone ?? null,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return { tenant: newTenant, owner: newOwner };
  });

  const tokens = issueTokens(jwt, {
    sub: owner.id,
    tenantId: tenant.id,
    email: owner.email,
    role: owner.role,
  });

  return { ...tokens, user: owner, tenant };
}

export async function loginUser(
  jwt: JwtUtils,
  body: LoginBody,
): Promise<AuthResponse> {
  // Raw SQL to bypass RLS — at login time we don't know the tenantId yet.
  // In dev, the postgres superuser has BYPASSRLS so this also works via Prisma ORM.
  type UserRow = {
    id: string;
    tenantId: string;
    email: string;
    name: string;
    passwordHash: string;
    role: string;
  };

  const rows = await db.$queryRaw<UserRow[]>(
    Prisma.sql`SELECT id, "tenantId", email, name, "passwordHash", role
               FROM users
               WHERE email = ${body.email} AND "deletedAt" IS NULL
               LIMIT 1`,
  );

  const user = rows[0];
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const valid = await compare(body.password, user.passwordHash);
  if (!valid) {
    throw new InvalidCredentialsError();
  }

  const tenant = await db.tenant.findUnique({
    where: { id: user.tenantId },
    select: { id: true, slug: true, name: true },
  });

  if (!tenant) {
    throw new InvalidCredentialsError();
  }

  const tokens = issueTokens(jwt, {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  return {
    ...tokens,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant,
  };
}

export async function refreshTokens(jwt: JwtUtils, refreshToken: string): Promise<TokenPair> {
  let payload: RefreshPayload;

  try {
    payload = jwt.verify<RefreshPayload>(refreshToken);
  } catch {
    throw new InvalidTokenError();
  }

  if (payload.type !== 'refresh') {
    throw new InvalidTokenError();
  }

  // Fetch current user data to get up-to-date role and email
  type UserRow = { id: string; tenantId: string; email: string; role: string };
  const rows = await db.$queryRaw<UserRow[]>(
    Prisma.sql`SELECT id, "tenantId", email, role
               FROM users
               WHERE id = ${payload.sub} AND "deletedAt" IS NULL
               LIMIT 1`,
  );

  const user = rows[0];
  if (!user) {
    throw new InvalidTokenError();
  }

  return issueTokens(jwt, {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });
}
