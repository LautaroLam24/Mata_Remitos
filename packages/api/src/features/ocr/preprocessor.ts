import sharp from 'sharp';
import { ImagePreprocessError } from './errors.js';

export async function preprocessImage(
  buffer: Buffer,
  mimeType: string = 'image/jpeg',
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (mimeType === 'application/pdf') {
    return { buffer, mimeType: 'application/pdf' };
  }

  try {
    const processed = await sharp(buffer)
      .rotate()
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return { buffer: processed, mimeType: 'image/jpeg' };
  } catch (err) {
    throw new ImagePreprocessError('Failed to preprocess image', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
