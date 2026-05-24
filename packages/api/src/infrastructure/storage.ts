import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { config } from '../shared/config.js';

const globalForS3 = globalThis as unknown as { _s3?: S3Client };

export const s3 =
  globalForS3._s3 ??
  new S3Client({
    endpoint: config.STORAGE_ENDPOINT,
    region: config.STORAGE_REGION,
    credentials: {
      accessKeyId: config.STORAGE_ACCESS_KEY,
      secretAccessKey: config.STORAGE_SECRET_KEY,
    },
    forcePathStyle: true,
  });

if (config.NODE_ENV !== 'production') {
  globalForS3._s3 = s3;
}

export async function uploadFile(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const input: PutObjectCommandInput = {
    Bucket: config.STORAGE_BUCKET,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
  };
  await s3.send(new PutObjectCommand(input));
  return `${config.STORAGE_PUBLIC_URL}/${params.key}`;
}

export async function downloadFile(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key }),
  );

  if (!response.Body) throw new Error(`Empty body for key: ${key}`);

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
