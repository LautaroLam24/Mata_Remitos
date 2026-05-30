import { GoogleGenerativeAI } from '@google/generative-ai';

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

function getClient(): GoogleGenerativeAI {
  const key = process.env['GEMINI_API_KEY'];
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenerativeAI(key);
}

async function callModel(
  modelName: string,
  buffer: Buffer,
  prompt: string,
  mimeType: string = 'image/jpeg',
): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: buffer.toString('base64') } },
  ]);

  const text = result.response.text();
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

export async function callGeminiVision(
  buffer: Buffer,
  prompt: string,
  mimeType: string = 'image/jpeg',
): Promise<string> {
  let lastError: Error | undefined;

  for (const modelName of MODELS) {
    try {
      const text = await callModel(modelName, buffer, prompt, mimeType);
      if (modelName !== MODELS[0]) {
        console.log(`[OCR] Gemini: using fallback model ${modelName}`);
      }
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      console.warn(`[OCR] Gemini ${modelName} error: ${msg}`);
      if (
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED')
      ) {
        console.warn(`[OCR] Gemini ${modelName}: quota exceeded, trying next model`);
        continue;
      }
      // Auth error (invalid key, wrong project) — no point retrying other models
      if (
        msg.includes('API key not valid') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('403')
      ) {
        throw new Error(`Gemini API key inválida o sin permisos: ${msg}`);
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('All Gemini models failed');
}
