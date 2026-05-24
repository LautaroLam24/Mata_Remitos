import { callGeminiVision } from '../../infrastructure/ai/gemini.js';
import { preprocessImage } from './preprocessor.js';
import { extractionResultSchema, type ExtractionResult } from './schemas.js';
import { ExtractionParseError } from './errors.js';

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

export async function extractDocument(imageBuffer: Buffer): Promise<ExtractionResult> {
  const optimized = await preprocessImage(imageBuffer);

  const raw1 = await callGeminiVision(optimized, EXTRACTION_PROMPT);
  const parsed1 = parseJsonResponse(raw1);
  const validated1 = extractionResultSchema.safeParse(parsed1);

  if (validated1.success) {
    return validated1.data;
  }

  const raw2 = await callGeminiVision(optimized, EXTRACTION_PROMPT);
  const parsed2 = parseJsonResponse(raw2);
  const validated2 = extractionResultSchema.safeParse(parsed2);

  if (validated2.success) {
    return validated2.data;
  }

  throw new ExtractionParseError({
    attempt1: raw1.slice(0, 200),
    attempt2: raw2.slice(0, 200),
    zodError: validated2.error.flatten(),
  });
}
