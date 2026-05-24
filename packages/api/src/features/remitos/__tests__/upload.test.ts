import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../../../infrastructure/storage.js', () => ({
  uploadFile: vi.fn().mockResolvedValue('http://localhost:9000/test/key.jpg'),
  downloadFile: vi.fn(),
}));

vi.mock('../../../infrastructure/queue.js', () => ({
  DOCUMENT_PROCESS_QUEUE: 'document.process',
  getDocumentQueue: vi.fn().mockResolvedValue({
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id-123' }),
  }),
}));

vi.mock('../../../infrastructure/redis.js', () => ({
  redis: { options: {} },
}));

vi.mock('../../../infrastructure/db.js', () => ({
  db: {
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import { uploadDocument } from '../service.js';
import { uploadFile } from '../../../infrastructure/storage.js';
import { getDocumentQueue } from '../../../infrastructure/queue.js';
import { InvalidFileTypeError, FileTooLargeError } from '../errors.js';
import type { MultipartFile } from '@fastify/multipart';

const mockUploadFile = vi.mocked(uploadFile);
const mockGetQueue = vi.mocked(getDocumentQueue);

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/remitos/upload — auth boundary', () => {
  it('returns 401 when no Authorization header', async () => {
    const boundary = 'testboundary';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\nfakedata\r\n--${boundary}--`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/remitos/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is malformed', async () => {
    const boundary = 'testboundary';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\nfakedata\r\n--${boundary}--`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/remitos/upload',
      headers: {
        authorization: 'Bearer not.a.valid.token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token type is refresh (not access)', async () => {
    const refreshToken = app.jwt.sign(
      { sub: 'user-id', tenantId: 'tenant-id', type: 'refresh' },
      { expiresIn: '7d' },
    );

    const boundary = 'testboundary';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\nfakedata\r\n--${boundary}--`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/remitos/upload',
      headers: {
        authorization: `Bearer ${refreshToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('uploadDocument service — unit', () => {
  beforeAll(() => {
    mockUploadFile.mockReset();
    mockUploadFile.mockResolvedValue('http://localhost:9000/test/key.jpg');
    mockGetQueue.mockReset();
    mockGetQueue.mockResolvedValue({
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    } as Awaited<ReturnType<typeof getDocumentQueue>>);
  });

  it('throws InvalidFileTypeError for non-image mimetype', async () => {
    const fakeFile = {
      mimetype: 'application/pdf',
      file: (async function* () {})(),
    } as unknown as MultipartFile;

    await expect(
      uploadDocument({ file: fakeFile, tenantId: 'tenant-1', userId: 'user-1' }),
    ).rejects.toThrow(InvalidFileTypeError);
  });

  it('throws FileTooLargeError when chunks exceed 10MB', async () => {
    const bigChunk = Buffer.alloc(11 * 1024 * 1024);
    const fakeFile = {
      mimetype: 'image/jpeg',
      file: (async function* () {
        yield bigChunk;
      })(),
    } as unknown as MultipartFile;

    await expect(
      uploadDocument({ file: fakeFile, tenantId: 'tenant-1', userId: 'user-1' }),
    ).rejects.toThrow(FileTooLargeError);
  });

  it('returns jobId + imageKey on valid JPEG upload', async () => {
    const fakeFile = {
      mimetype: 'image/jpeg',
      file: (async function* () {
        yield Buffer.from('fake jpeg data');
      })(),
    } as unknown as MultipartFile;

    const result = await uploadDocument({
      file: fakeFile,
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    expect(result.jobId).toBeTruthy();
    expect(result.imageKey).toMatch(/^tenant-1\/.+\.jpg$/);
    expect(mockUploadFile).toHaveBeenCalledOnce();
  });
});
