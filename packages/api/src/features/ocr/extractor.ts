import { UnrecoverableError } from 'bullmq';
import { callGeminiVision } from '../../infrastructure/ai/gemini.js';
import { callClaudeVision } from '../../infrastructure/ai/claude.js';
import { preprocessImage } from './preprocessor.js';
import { extractionResultSchema, type ExtractionResult } from './schemas.js';
import { ExtractionParseError } from './errors.js';

function getMockExtraction(): ExtractionResult {
  const uniqueSuffix = Date.now().toString().slice(-6);
  return {
    documentType: 'remito',
    documentNumber: { value: `R-MOCK-${uniqueSuffix}`, confidence: 99 },
    date: { value: new Date().toISOString().split('T')[0]!, confidence: 99 },
    supplier: {
      cuit: { value: '30-71234567-8', confidence: 99 },
      name: { value: 'Alimentos Del Norte SA', confidence: 99 },
    },
    items: [
      {
        code: { value: 'ARR-001', confidence: 95 },
        description: { value: 'Arroz Blanco 1kg', confidence: 98 },
        quantity: { value: 10, confidence: 97 },
        unit: { value: 'un', confidence: 99 },
        unitPrice: { value: 850, confidence: 90 },
        subtotal: { value: 8500, confidence: 90 },
      },
      {
        code: { value: 'ACE-001', confidence: 95 },
        description: { value: 'Aceite Girasol 900ml', confidence: 97 },
        quantity: { value: 6, confidence: 98 },
        unit: { value: 'un', confidence: 99 },
        unitPrice: { value: 1200, confidence: 88 },
        subtotal: { value: 7200, confidence: 88 },
      },
    ],
    total: { value: 15700, confidence: 92 },
    rawText: '[MOCK] Documento simulado para desarrollo local',
    overallConfidence: 94,
    warnings: ['[MODO MOCK] Extracción simulada — sin llamada real a la IA'],
  };
}

const EXTRACTION_PROMPT = `Sos un sistema experto en extracción de datos de documentos comerciales argentinos.

Tu tarea: extraer la información estructurada del documento en la imagen.

Devolvé ÚNICAMENTE un objeto JSON con este schema exacto:

{
  "documentType": "remito" | "factura_a" | "factura_b" | "factura_c" | "nota_pedido" | "desconocido",
  "documentNumber": { "value": string, "confidence": number (0-100) },
  "date": { "value": string (formato YYYY-MM-DD), "confidence": number },
  "supplier": {
    "cuit": { "value": string (formato XX-XXXXXXXX-X), "confidence": number },
    "name": { "value": string, "confidence": number }
  },
  "items": [
    {
      "code": { "value": string | null, "confidence": number },
      "description": { "value": string, "confidence": number },
      "quantity": { "value": number, "confidence": number },
      "unit": { "value": string (ej: "un", "kg", "lt", "caja"), "confidence": number },
      "unitPrice": { "value": number | null, "confidence": number },
      "subtotal": { "value": number | null, "confidence": number }
    }
  ],
  "total": { "value": number | null, "confidence": number },
  "rawText": string,
  "overallConfidence": number (0-100),
  "warnings": string[]
}

Reglas de extracción:
1. CUIT: formateado como XX-XXXXXXXX-X.
2. Fechas: ISO 8601 (YYYY-MM-DD).
3. Cantidades: siempre numéricas.
4. Confidence: 95-100 legible sin ambigüedad; 85-94 claro con ambigüedad menor; 70-84 interpretación parcial; <70 dudoso.
5. Si no podés extraer un campo, ponelo en null con confidence 0.

NO incluyas explicaciones fuera del JSON. NO uses markdown code blocks. Solo el JSON puro.`;

function parseJsonResponse(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    return null;
  }
}

async function tryExtract(
  callFn: (buf: Buffer, prompt: string) => Promise<string>,
  label: string,
  imageBuffer: Buffer,
): Promise<ExtractionResult | null> {
  try {
    const raw = await callFn(imageBuffer, EXTRACTION_PROMPT);
    const parsed = parseJsonResponse(raw);
    const validated = extractionResultSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn(`[OCR] ${label}: response parsed but failed Zod validation`, validated.error.flatten());
    }
    return validated.success ? validated.data : null;
  } catch (err) {
    console.warn(`[OCR] ${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function extractDocument(imageBuffer: Buffer): Promise<ExtractionResult> {
  if (process.env['OCR_MOCK'] === 'true') {
    console.log('[OCR] Mock mode — skipping AI call');
    return getMockExtraction();
  }

  const optimized = await preprocessImage(imageBuffer);

  // First pass: Gemini
  let geminiQuotaExceeded = false;
  try {
    const raw = await callGeminiVision(optimized, EXTRACTION_PROMPT);
    const parsed = parseJsonResponse(raw);
    const validated = extractionResultSchema.safeParse(parsed);
    if (validated.success) return validated.data;
    console.warn('[OCR] Gemini: response parsed but failed Zod validation', validated.error.flatten());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[OCR] Gemini failed:', msg);
    if (msg.includes('429') || msg.includes('quota')) {
      geminiQuotaExceeded = true;
    }
  }

  // Fallback: Claude
  try {
    const raw = await callClaudeVision(optimized, EXTRACTION_PROMPT);
    const parsed = parseJsonResponse(raw);
    const validated = extractionResultSchema.safeParse(parsed);
    if (validated.success) return validated.data;
    console.warn('[OCR] Claude: response parsed but failed Zod validation', validated.error.flatten());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[OCR] Claude failed:', msg);
    // If both APIs are quota/unconfigured, fail fast without retries
    if (geminiQuotaExceeded || msg.includes('API_KEY')) {
      throw new UnrecoverableError(
        geminiQuotaExceeded
          ? 'Gemini quota exceeded — configure a new GEMINI_API_KEY or set OCR_MOCK=true'
          : 'No AI provider configured — set GEMINI_API_KEY or ANTHROPIC_API_KEY',
      );
    }
  }

  throw new ExtractionParseError({
    attempt1: 'Gemini failed',
    attempt2: 'Claude fallback also failed',
    zodError: { formErrors: [], fieldErrors: {} },
  });
}
