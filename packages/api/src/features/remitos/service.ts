import type { MultipartFile } from '@fastify/multipart';
import { uploadFile } from '../../infrastructure/storage.js';
import { getDocumentQueue } from '../../infrastructure/queue.js';
import { processDocumentCore } from './processing-core.js';
import { config } from '../../shared/config.js';
import { InvalidFileTypeError, FileTooLargeError } from './errors.js';
import type { UploadResponse } from './schemas.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB para PDFs

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

  for await (const chunk of file.file as AsyncIterable<Buffer>) {
    totalSize += chunk.length;
    if (totalSize > MAX_SIZE_BYTES) {
      throw new FileTooLargeError(totalSize);
    }
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  const ext =
    file.mimetype === 'application/pdf'
      ? 'pdf'
      : file.mimetype === 'image/png'
        ? 'png'
        : file.mimetype === 'image/webp'
          ? 'webp'
          : 'jpg';
  const imageKey = `${tenantId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  await uploadFile({ key: imageKey, body: buffer, contentType: file.mimetype });

  if (config.OCR_SYNC === 'true') {
    const { documentId } = await processDocumentCore({ imageKey, tenantId, userId });
    return {
      jobId: 'sync',
      documentId,
      imageKey,
      message: 'Document processed synchronously',
    };
  }

  const queue = await getDocumentQueue();
  const job = await queue.add('process', { imageKey, tenantId, userId });

  return {
    jobId: job.id ?? 'unknown',
    imageKey,
    message: 'Document uploaded and queued for processing',
  };
}
