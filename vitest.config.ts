import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      // Deterministic signing secret for the CAPTCHA token tests so tokens
      // are stable within a run (production falls back to a per-process one).
      CAPTCHA_SECRET: 'test-only-captcha-secret',
      CONVERT_TICKET_SECRET: 'test-only-convert-ticket-secret',
      // Route integration tests model a deployment behind a proxy. Production
      // platforms select their own non-spoofable header in clientIp().
      TRUSTED_PROXY_IP_HEADER: 'x-forwarded-for',
    },
  },
});
