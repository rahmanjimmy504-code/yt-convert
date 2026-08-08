import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      // Deterministic signing secret for the CAPTCHA token tests so tokens
      // are stable within a run (production falls back to a per-process one).
      CAPTCHA_SECRET: 'test-only-captcha-secret',
    },
  },
});
