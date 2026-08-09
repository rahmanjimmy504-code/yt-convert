/**
 * Per-environment CAPTCHA credentials.
 *
 * Production, Vercel previews, and local development can each use their own
 * Cloudflare Turnstile / reCAPTCHA / hCaptcha keys. The scope is detected
 * automatically:
 *
 *   VERCEL_ENV=production  ->  *_PROD
 *   VERCEL_ENV=preview     ->  *_PREVIEW
 *   local `npm run dev`    ->  *_DEV     (NODE_ENV=development)
 *   self-hosted prod build ->  *_PROD    (NODE_ENV=production, no VERCEL_ENV)
 *   tests                  ->  *_DEV     (NODE_ENV=test)
 *
 * Values are read as `<BASE>_<SCOPE>` first (e.g. `TURNSTILE_SECRET_KEY_PROD`)
 * and fall back to the plain `<BASE>` variable, so existing single-key
 * deployments keep working without any changes.
 */

export type CaptchaScope = 'prod' | 'preview' | 'dev';

export function getCaptchaScope(): CaptchaScope {
  if (process.env.VERCEL_ENV === 'production') return 'prod';
  if (process.env.VERCEL_ENV === 'preview') return 'preview';
  // Non-Vercel hosts (self-hosted servers, containers) run production builds
  // too; only real development/test environments get the dev keys.
  if (process.env.NODE_ENV === 'production') return 'prod';
  return 'dev';
}

/**
 * Resolve a configuration variable for the current environment.
 *
 * Scoped (`<base>_<SCOPE>`) values win; the unscoped variable is the legacy
 * fallback. Public NEXT_PUBLIC_* keys are also resolved here so
 * next.config.ts can inline the correct per-environment site key into the
 * client bundle at build time (Vercel sets VERCEL_ENV during preview builds).
 */
export function getScopedEnv(base: string, scope: CaptchaScope = getCaptchaScope()): string | undefined {
  const scoped = process.env[`${base}_${scope.toUpperCase()}`];
  if (scoped) return scoped;
  return process.env[base] || undefined;
}
