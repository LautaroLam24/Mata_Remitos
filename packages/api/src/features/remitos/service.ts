import type { MultipartFile } from '@fastify/multipart';
import { uploadFile } from '../../infrastructure/storage.js';
import { getDocumentQueue } from '../../infrastructure/queue.js';
import { InvalidFileTypeError, FileTooLargeError } from './errors.js';
import type { UploadResponse } from './schemas.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function uploadDocument(params: {
  file: MultipartFile;
  tenantId: string;
  userId: string;
}): Promise<UploadResponse> {
  const { file, tenantId, userId } = params;

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new InvalidFileTypeError(file.mimetype);
  }

  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of file.file) {
    totalSize += chunk.length;
    if (totalSize > MAX_SIZE_BYTES) {
      throw new FileTooLargeError(totalSize);
    }
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
  const imageKey = `${tenantId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  await uploadFile({ key: imageKey, body: buffer, contentType: file.mimetype });

  const queue = await getDocumentQueue();
  const job = await queue.add('process', { imageKey, tenantId, userId });

  return {
    jobId: job.id ?? 'unknown',
    imageKey,
    message: 'Document uploaded and queued for processing',
  };
}
