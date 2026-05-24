# Test Fixtures

Real remito/factura photos are not committed to the repository for privacy and size reasons.

The OCR extractor tests (`src/features/ocr/__tests__/extractor.test.ts`) use:
- **Inline sharp-generated buffers** (white 10×10 JPEG via raw pixel data) as placeholder image inputs
- **Mocked Gemini responses** — no real API calls in unit tests

## Adding real fixtures for manual/integration testing

1. Add JPEG images to `packages/api/test/fixtures/images/` (gitignored)
2. Set `GEMINI_API_KEY` in `.env`
3. Run: `npx tsx test/fixtures/manual-test.ts`

Fixture naming convention:
- `remito-clear.jpg` — high quality scan, expected overallConfidence ≥ 95
- `remito-blurry.jpg` — blurry photo, expected overallConfidence < 75
- `non-document.jpg` — selfie/unrelated, expected documentType = "desconocido"
