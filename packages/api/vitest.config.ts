import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    forceExit: true,
    env: {
      NODE_ENV: 'test',
      GEMINI_API_KEY: 'test-gemini-key',
      STORAGE_ENDPOINT: 'http://localhost:9000',
      STORAGE_BUCKET: 'test-bucket',
      STORAGE_ACCESS_KEY: 'minioadmin',
      STORAGE_SECRET_KEY: 'minioadmin',
      STORAGE_REGION: 'us-east-1',
      STORAGE_PUBLIC_URL: 'http://localhost:9000/test-bucket',
    },
  },
});
