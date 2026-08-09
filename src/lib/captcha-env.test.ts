import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCaptchaScope, getScopedEnv } from './captcha-env';

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getCaptchaScope', () => {
  it('returns prod for Vercel production builds', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(getCaptchaScope()).toBe('prod');
  });

  it('returns preview for Vercel preview deployments', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(getCaptchaScope()).toBe('preview');
  });

  it('returns prod for self-hosted production builds without VERCEL_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.VERCEL_ENV;
    expect(getCaptchaScope()).toBe('prod');
  });

  it('returns dev for local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.VERCEL_ENV;
    expect(getCaptchaScope()).toBe('dev');
  });

  it('returns dev in tests', () => {
    expect(getCaptchaScope()).toBe('dev');
  });
});

describe('getScopedEnv', () => {
  it('prefers the scoped variable for the current environment', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'plain');
    vi.stubEnv('TURNSTILE_SECRET_KEY_PREVIEW', 'preview-secret');
    expect(getScopedEnv('TURNSTILE_SECRET_KEY')).toBe('preview-secret');
  });

  it('falls back to the plain variable when no scoped value is set', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'plain');
    expect(getScopedEnv('TURNSTILE_SECRET_KEY')).toBe('plain');
  });

  it('returns undefined when nothing is set', () => {
    delete process.env.HCAPTCHA_SECRET_KEY;
    delete process.env.HCAPTCHA_SECRET_KEY_DEV;
    expect(getScopedEnv('HCAPTCHA_SECRET_KEY')).toBeUndefined();
  });

  it('supports an explicit scope argument', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY_PROD', 'prod-key');
    expect(getScopedEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'prod')).toBe('prod-key');
  });
});
