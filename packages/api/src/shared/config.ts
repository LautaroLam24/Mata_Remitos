import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_PUBLIC_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  OCR_MOCK: z.string().optional(),
  OCR_SYNC: z.enum(['true', 'false']).optional(),
});

// Dotenv sets unset optional vars to "" (empty string) — treat them as undefined
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
);

const parsed = envSchema.safeParse(rawEnv);
if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

if (parsed.data.OCR_SYNC !== 'true' && !parsed.data.REDIS_URL) {
  console.error('❌ Se requiere REDIS_URL cuando OCR_SYNC no es "true"');
  process.exit(1);
}

if (
  parsed.data.OCR_MOCK !== 'true' &&
  !parsed.data.GEMINI_API_KEY &&
  !parsed.data.ANTHROPIC_API_KEY
) {
  console.error(
    '❌ Se requiere GEMINI_API_KEY o ANTHROPIC_API_KEY cuando OCR_MOCK no es "true"',
  );
  process.exit(1);
}

export const config = parsed.data;
