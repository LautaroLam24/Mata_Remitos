import { GoogleGenerativeAI } from '@google/generative-ai';

const MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function getClient(): GoogleGenerativeAI {
  const key = process.env['GEMINI_API_KEY'];
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenerativeAI(key);
}

async function callModel(modelName: string, imageBuffer: Buffer, prompt: string): Promise<string> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBuffer.toString('base64') } },
  ]);

  const text = result.response.text();
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

export async function callGeminiVision(imageBuffer: Buffer, prompt: string): Promise<string> {
  let lastError: Error | undefined;

  for (const modelName of MODELS) {
    try {
      const text = await callModel(modelName, imageBuffer, prompt);
      if (modelName !== MODELS[0]) {
        console.log(`[OCR] Gemini: using fallback model ${modelName}`);
      }
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      if (msg.includes('429') || msg.includes('quota')) {
        console.warn(`[OCR] Gemini ${modelName}: quota exceeded, trying next model`);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('All Gemini models failed');
}
