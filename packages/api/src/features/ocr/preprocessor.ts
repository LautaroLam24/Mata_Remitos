import sharp from 'sharp';
import { ImagePreprocessError } from './errors.js';

export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .rotate()
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    throw new ImagePreprocessError('Failed to preprocess image', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
