import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../app.js';
import { db } from '../../../infrastructure/db.js';
import type { FastifyInstance } from 'fastify';

const TEST_SLUG = `test-auth-${Date.now()}`;
const TEST_OWNER_EMAIL = `owner-${Date.now()}@test.com`;
const TEST_PASSWORD = 'Password123';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  // Clean up in FK order: users → tenants
  const tenant = await db.tenant.findUnique({
    where: { slug: TEST_SLUG },
    select: { id: true },
  });
  if (tenant) {
    await db.user.deleteMany({ where: { tenantId: tenant.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
  }
  await app.close();
  await db.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('creates tenant and owner, returns tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        tenantName: 'Test Company',
        tenantSlug: TEST_SLUG,
        ownerEmail: TEST_OWNER_EMAIL,
        ownerName: 'Test Owner',
        ownerPassword: TEST_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string; name: string; role: string };
      tenant: { id: string; slug: string; name: string };
    }>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe(TEST_OWNER_EMAIL);
    expect(body.user.role).toBe('owner');
    expect(body.tenant.slug).toBe(TEST_SLUG);
  });

  it('returns 409 when slug is already taken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        tenantName: 'Duplicate',
        tenantSlug: TEST_SLUG,
        ownerEmail: `other-${Date.now()}@test.com`,
        ownerName: 'Other Owner',
        ownerPassword: TEST_PASSWORD,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('TENANT_SLUG_TAKEN');
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_OWNER_EMAIL, password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ accessToken: string; refreshToken: string }>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_OWNER_EMAIL, password: 'wrongpassword' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@unknown.com', password: TEST_PASSWORD },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /api/auth/refresh', () => {
  let validRefreshToken: string;
  let validAccessToken: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_OWNER_EMAIL, password: TEST_PASSWORD },
    });
    const body = res.json<{ accessToken: string; refreshToken: string }>();
    validRefreshToken = body.refreshToken ?? '';
    validAccessToken = body.accessToken ?? '';
  });

  it('returns new token pair for valid refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: validRefreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ accessToken: string; refreshToken: string }>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });

  it('returns 401 when sending an access token instead of refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: validAccessToken },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for garbage token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'not.a.valid.jwt.token' },
    });

    expect(res.statusCode).toBe(401);
  });
});
