import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

vi.mock('../../../infrastructure/ai/gemini.js', () => ({
  callGeminiVision: vi.fn(),
}));

import { extractDocument } from '../extractor.js';
import { callGeminiVision } from '../../../infrastructure/ai/gemini.js';
import type { ExtractionResult } from '../schemas.js';
import { ExtractionParseError } from '../errors.js';

const mockCallGemini = vi.mocked(callGeminiVision);

async function makeFixtureJpeg(): Promise<Buffer> {
  const rawPixels = Buffer.alloc(10 * 10 * 3, 255);
  return sharp(rawPixels, { raw: { width: 10, height: 10, channels: 3 } })
    .jpeg()
    .toBuffer();
}

const VALID_EXTRACTION: ExtractionResult = {
  documentType: 'remito',
  documentNumber: { value: 'R-001-00001234', confidence: 98 },
  date: { value: '2024-03-15', confidence: 95 },
  supplier: {
    cuit: { value: '20-12345678-9', confidence: 97 },
    name: { value: 'Distribuidora Test SA', confidence: 96 },
  },
  items: [
    {
      code: { value: 'PROD-001', confidence: 90 },
      description: { value: 'Harina 0000 x 25kg', confidence: 95 },
      quantity: { value: 10, confidence: 98 },
      unit: { value: 'kg', confidence: 99 },
      unitPrice: { value: 1500, confidence: 92 },
      subtotal: { value: 15000, confidence: 94 },
    },
  ],
  total: { value: 15000, confidence: 95 },
  rawText: 'Remito R-001-00001234 ...',
  overallConfidence: 95,
  warnings: [],
};

describe('extractDocument', () => {
  beforeEach(() => {
    mockCallGemini.mockReset();
  });

  it('fixture 1: returns extraction when Gemini returns valid JSON on first attempt', async () => {
    const image = await makeFixtureJpeg();
    mockCallGemini.mockResolvedValueOnce(JSON.stringify(VALID_EXTRACTION));

    const result = await extractDocument(image);

    expect(result.documentType).toBe('remito');
    expect(result.overallConfidence).toBe(95);
    expect(result.supplier.cuit.value).toBe('20-12345678-9');
    expect(mockCallGemini).toHaveBeenCalledTimes(1);
  });

  it('fixture 2: retries once and succeeds when first attempt returns invalid JSON', async () => {
    const image = await makeFixtureJpeg();
    mockCallGemini
      .mockResolvedValueOnce('not valid json at all')
      .mockResolvedValueOnce(JSON.stringify(VALID_EXTRACTION));

    const result = await extractDocument(image);

    expect(result.documentType).toBe('remito');
    expect(mockCallGemini).toHaveBeenCalledTimes(2);
  });

  it('fixture 3: throws ExtractionParseError after 2 failed attempts', async () => {
    const image = await makeFixtureJpeg();
    mockCallGemini
      .mockResolvedValueOnce('garbage response 1')
      .mockResolvedValueOnce('garbage response 2');

    await expect(extractDocument(image)).rejects.toThrow(ExtractionParseError);
    expect(mockCallGemini).toHaveBeenCalledTimes(2);
  });

  it('strips markdown code fences from model response', async () => {
    const image = await makeFixtureJpeg();
    const wrapped = `\`\`\`json\n${JSON.stringify(VALID_EXTRACTION)}\n\`\`\``;
    mockCallGemini.mockResolvedValueOnce(wrapped);

    const result = await extractDocument(image);
    expect(result.documentType).toBe('remito');
  });
});
